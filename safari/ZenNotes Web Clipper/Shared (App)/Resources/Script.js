// Called by ViewController once the page loads: the platform, and on the Mac
// whether the extension is on in Safari (undefined when Safari cannot say).
function show(platform, enabled) {
    document.body.classList.add(`platform-${platform}`);
    document.body.classList.toggle('state-on', enabled === true);
    document.body.classList.toggle('state-off', enabled === false);
    if (platform === 'mac') document.querySelector('button.open-preferences').focus();
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage('open-preferences');
}

document.querySelector('button.open-preferences').addEventListener('click', openPreferences);
