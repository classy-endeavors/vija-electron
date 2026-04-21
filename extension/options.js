const bridgeUrlInput = document.getElementById('bridgeUrl')
const sessionTokenInput = document.getElementById('sessionToken')
const saveButton = document.getElementById('save')
const statusNode = document.getElementById('status')

const DEFAULT_SETTINGS = {
  bridgeUrl: 'http://127.0.0.1:45731',
  sessionToken: ''
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS)
  bridgeUrlInput.value = settings.bridgeUrl || DEFAULT_SETTINGS.bridgeUrl
  sessionTokenInput.value = settings.sessionToken || ''
}

async function saveSettings() {
  await chrome.storage.local.set({
    bridgeUrl: bridgeUrlInput.value.trim() || DEFAULT_SETTINGS.bridgeUrl,
    sessionToken: sessionTokenInput.value.trim()
  })

  statusNode.textContent = 'Settings saved.'
  window.setTimeout(() => {
    statusNode.textContent = ''
  }, 2000)
}

saveButton.addEventListener('click', () => {
  void saveSettings()
})

void loadSettings()
