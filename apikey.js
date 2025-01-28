const fs = require('fs');
const path = require('path');
const os = require('os');

// Create cross-platform config directory path
const configDir = path.join(os.homedir(), '.config', 'gitp');
const configFilePath = path.join(configDir, 'config.json');

function ensureConfigDirExists() {
	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true });
	}
}

function loadCredentials() {
	ensureConfigDirExists();
	if (fs.existsSync(configFilePath)) {
		try {
			return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
		} catch (error) {
			console.error('Error reading config file:', error);
			return { openAiApiKey: '' };
		}
	}
	return { openAiApiKey: '' };
}

function saveCredentials(credentials) {
	ensureConfigDirExists();
	try {
		fs.writeFileSync(configFilePath, JSON.stringify(credentials, null, 2));
	} catch (error) {
		console.error('Error saving config file:', error);
		throw error;
	}
}

module.exports = { loadCredentials, saveCredentials };
