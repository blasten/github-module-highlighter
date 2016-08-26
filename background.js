var redirectURL = '';

function getQueryParams(url) {
  let paramObj = {};
  let params = url.split('?');
  if (params.length === 2) {
    params[1].split('&').forEach(param => {
      let parts = param.split('=');
      paramObj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
  }
  return paramObj;
}

chrome.webRequest.onBeforeRequest.addListener(function(details) {
  if (redirectURL != '') {
    shouldRedirect = false;
    let params = getQueryParams(redirectURL);
    let newUrl = redirectURL.replace(/\?.*$/, '');
    redirectURL = '';

    switch (params.attempt) {
      case '1':
        if (/\/dist\//.test(newUrl)) {
          newUrl = newUrl.replace(/\/dist\//, '/src/');
        } else {
          newUrl = newUrl.replace(/\.js$/, '/index.js');
        }
        return { redirectUrl: `${newUrl}?attempt=2` };
      case '2':
        newUrl = newUrl.replace(/\.js$/, '/index.js');
        newUrl = newUrl.replace(/\/blob.+$/, '');
        return { redirectUrl: `${newUrl}?attempt=3` };
    }
  }
}, {
  urls: ['*://github.com/*']
}, ['blocking']);

// Idea borrowed from http://bit.ly/1p2IjN3
chrome.webRequest.onHeadersReceived.addListener(function(details) {
  for (let i = 0; i < details.responseHeaders.length; i++) {
    if (isCSPHeader(details.responseHeaders[i].name.toUpperCase())) {
      var csp = details.responseHeaders[i].value;
      csp = csp.replace("media-src 'none'", "media-src 'self' blob:");
      details.responseHeaders[i].value = csp;
    }
  }

  if (details.statusCode == 404) {
    let params = getQueryParams(details.url);
    if (params.attempt == '1' || params.attempt == '2') {
      redirectURL = details.url;
      chrome.tabs.reload();
    }
  }

  return { // Return the new HTTP header
    responseHeaders: details.responseHeaders
  };
}, {
  urls: ["*://github.com/*"],
  types: ["main_frame"]
}, ["blocking", "responseHeaders"]);

function isCSPHeader(headerName) {
  return (headerName == 'CONTENT-SECURITY-POLICY') || (headerName == 'X-WEBKIT-CSP');
}
