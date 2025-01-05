const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, 'config.json');

function loadCredentials() {
	if (fs.existsSync(configFilePath)) {
		return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
	}
	return { openAiApiKey: '' };
}

function saveCredentials(credentials) {
	fs.writeFileSync(configFilePath, JSON.stringify(credentials, null, 2));
}

module.exports = { loadCredentials, saveCredentials };
