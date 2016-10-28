(function() {
  'use strict';

  const IMPORT_CLASS_NAME = 'node-module';
  const LONG_LIFE_CACHE = true;
  const HOSTS = [
    '//npm-proxy-wcssulykhm.now.sh',
    '//npm-proxy-fhuiztlaje.now.sh',
    '//npm-proxy-whbayqyqfw.now.sh',
    '//npm-proxy-qjuzojhhmi.now.sh',
    '//npm-proxy-jzlxmasdqs.now.sh',
    '//npm-proxy-igndvghapw.now.sh',
    '//npm-proxy-nhrpsicmts.now.sh'
  ];
  let pkgCache = {};
  let tooltip = null;

  function getHost() {
    return HOSTS[~~(HOSTS.length * Math.random())];
  }

  function populatePackageInfo(info) {
    info.forEach(packageInfo => {
      if (packageInfo.name != null) {
        pkgCache[packageInfo.name] = packageInfo;
      }
    });
    if (LONG_LIFE_CACHE) {
      // We might have exceeded the quota, but there isn't really a good way to check that.
      try {
        chrome.storage.local.set(pkgCache);
      } catch (e) {
        chrome.storage.local.clear(_ => chrome.storage.local.set(pkgCache));
        console.warn('Storage error: ', e);
      }
    }
  }

  function loadPackages(modules) {
    modules = modules.map(module => module.replace(/\/.+/, ''));
    modules = modules.filter(moduleName => {
      return !pkgCache[moduleName] && !/^\./.test(moduleName)
    });

    chrome.storage.local.get(modules, (cachedModules) => {
      modules = modules.filter(moduleName => !cachedModules[moduleName]);

      Object.keys(cachedModules).forEach(moduleName => {
        pkgCache[moduleName] = cachedModules[moduleName];
      });

      if (modules.length == 0) {
        return;
      }
      fetch(`${getHost()}/?modules=${encodeURIComponent(modules.join(','))}`).
          then(content => content.json().then(info => populatePackageInfo(info)));
    });
  }

  function isRequire(node) {
    if (node.innerText != 'require' || !node.nextElementSibling) {
      return false;
    }
    let firstChar = node.nextElementSibling.innerText.charAt(0);
    return firstChar == '\'' || firstChar == '"';
  }

  function getRequireModules() {
    let requireNodes = [].filter.call(document.querySelectorAll('.pl-c1'),
        node => isRequire(node)).
        map(node => node.nextElementSibling);
    let requireModuleNames = requireNodes.map(node => node.innerText.slice(1, -1));
    return [requireModuleNames, requireNodes];
  }

  function isES6Import(node) {
    if (node.innerText != 'import') {
      return false;
    }
    let firstChar = node.parentElement.lastElementChild.innerText.charAt(0);
    return firstChar == '\'' || firstChar == '"';
  }

  function getImportModules() {
    let importNodes = [].filter.call(document.querySelectorAll('.pl-k'),
        node => isES6Import(node)).
        map(node => node.parentElement.lastElementChild);
    let importModuleNames = importNodes.map(node => node.innerText.slice(1, -1));
    return [importModuleNames, importNodes];
  }

  function decorateDOM() {
    let [requireModuleNames, requireNodes] = getRequireModules();
    let [importModuleNames, importNodes] = getImportModules();
    let moduleNames = [].concat(requireModuleNames, importModuleNames);
    let nodes = [].concat(requireNodes, importNodes);

    nodes.forEach((node, idx) => {
      node.classList.add(IMPORT_CLASS_NAME);
      node.dataset.npmModule = moduleNames[idx];
    });
    loadPackages(moduleNames);
  }

  function globalClickHandler(event) {
    if (!event.target.classList.contains(IMPORT_CLASS_NAME)) {
      return;
    }
    let target = event.target;
    let importName = target.dataset.npmModule;
    let rootPackage = importName.replace(/\/.+/, '');
    let packageInfo = pkgCache[rootPackage];

    if (/^\.+?\//.test(importName)) {
      // It's an import from the project's namescape
      let path = /\.js$/.test(importName) ? `${importName}?attempt=1` : `${importName}.js?attempt=1`;
      // Resolve path
      window.location.href = (new URL(path, window.location.href)).href;
    } else if (!packageInfo) {
      window.location.href = `//www.npmjs.com/package/${importName}`;
    } else if (!packageInfo.repository) {
      window.location.href = `//www.npmjs.com/package/${importName}`;
    } else {
      let repoUrl = packageInfo.repository.url;
      let mainFile = packageInfo.main || 'index';

      if (rootPackage != importName) {
        mainFile = importName.replace(/[^\/]+\//, '');
      }
      if (!/\.js$/.test(mainFile)) {
        mainFile += '.js';
      }
      // Normalize URL.
      repoUrl = repoUrl.replace(/^git\+/, '');
      repoUrl = repoUrl.replace(/\.git$/, '');
      repoUrl = repoUrl.replace('git@github.com:', 'github.com/');
      repoUrl = repoUrl.replace(/^[a-z]+\:\/\//i, '');
      repoUrl = /\/$/.test(repoUrl) ? repoUrl : repoUrl + '/';
      repoUrl = mainFile != '' && repoUrl.split('/').length === 4 ? `${repoUrl}blob/master/` : repoUrl;
      // Resolve path.
      window.location.href = (new URL(`${mainFile}?attempt=1`, `https://${repoUrl}`)).href;
    }
  }

  function globalMouseOver(event) {
    let target = event.target;

    if (!target) {
      return;
    }
    if (!target.classList.contains(IMPORT_CLASS_NAME)) {
      if (tooltip != null) {
        tooltip.dataset.visible = false;
      }
      return;
    }
    let importName = target.dataset.npmModule;
    let rootPackage = importName.replace(/\/.+/, '');
    let packageInfo = pkgCache[rootPackage];

    if (!packageInfo) {
      return;
    }
    if (!tooltip) {
      tooltip = document.createElement('npm-tooltip');
      document.body.appendChild(tooltip);
    }
    tooltip.dataset.packageName = packageInfo.name;
    tooltip.dataset.description = packageInfo.description;
    tooltip.dataset.homepage = packageInfo.homepage;
    tooltip.dataset.version = packageInfo.version;
    tooltip.dataset.dep = packageInfo.dependencies ?
        Object.keys(packageInfo.dependencies).length : 'none';
    tooltip.dataset.devDep = packageInfo.devDependencies ?
        Object.keys(packageInfo.devDependencies).length : 'none';
    tooltip.dataset.visible = true;
  }

  // Idea borrowed from github.com/thieman/github-selfies
  function inject(fn) {
    let script = document.createElement('script');
    let parent = document.documentElement;

    script.textContent = '('+ fn +')();';
    parent.appendChild(script);
    parent.removeChild(script);
  }

  inject(_ => {
    let pushState = window.history.pushState;
    let replaceState = window.history.replaceState;
    // Post a message whenever history.pushState is called. GitHub uses
    // pushState to implement page transitions without full page loads.
    // This needs to be injected because content scripts run in a sandbox.
    window.history.pushState = function customPushState() {
      window.postMessage('module-highlighter:pageUpdated', '*');
      return pushState.apply(this, arguments);
    };
    window.history.replaceState = function customReplaceState() {
      window.postMessage('module-highlighter:pageUpdated', '*');
      return replaceState.apply(this, arguments);
    };
    window.addEventListener('popstate', () => {
      window.postMessage('module-highlighter:pageUpdated', '*');
    });

    document.registerElement('npm-tooltip', class extends HTMLElement {
      createdCallback() {
        this.$refs = {};
        this.createShadowRoot().innerHTML = `
          <style>
            :host {
              position: fixed;
              right: 40px;
              top: 100px;
              background-color: white;
              border: 1px solid #ccc;
              border-radius: 2px;
              padding: 10px;
              width: 300px;
            }
          </style>
          <h1 id="headline" style="font-size: 15px; font-weight: 500;"></h1>
          <p id="version" style="color: #666;"></p>
          <p id="description" style="font-size: 12px;"></p>
          <p style="display: flex; font-weight: 500; font-size: 12px;">
            # DEPENDENCIES <span id="dep" style="flex: 1; text-align: right;"></span>
          </p>
          <p style="display: flex; font-weight: 500; font-size: 12px;">
            # DEV DEPENDENCIES <span id="devDep" style="flex: 1; text-align: right;"></span>
          </p>
        `;
      }

      $(id) {
        return this.$refs[id] || (this.$refs[id] = this.shadowRoot.querySelector('#' + id));
      }

      attributeChangedCallback() {
        clearInterval(this._renderTimer);
        this._renderTimer = setTimeout(this.render.bind(this), 10);
      }

      render() {
        let states = this.dataset;
        this.$('headline').innerText = states.packageName;
        this.$('version').innerText = states.version;
        this.$('description').innerText = states.description;
        this.$('dep').innerText = states.dep;
        this.$('devDep').innerText = states.devDep;
        this.style.display = states.visible == 'true' ? 'block' : 'none';
      }
    });
  });

  window.addEventListener('message', function(event) {
    if (event.data == 'module-highlighter:pageUpdated') {
      requestIdleCallback(decorateDOM);
    }
  });

  function whenDOMReady() {
    return new Promise(function(resolve, reject) {
      if (document.readyState == 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  whenDOMReady().then(requestIdleCallback.bind(window, decorateDOM));
  // Install global event listeners.
  window.addEventListener('click', globalClickHandler);
  window.addEventListener('mouseover', globalMouseOver);
})();
