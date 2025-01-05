module.exports = (...strings) => {
	// Define ANSI escape codes for colors
	const colors = {
		reset: '\x1b[0m',
		bold: '\x1b[1m',
		black: '\x1b[30m',
		red: '\x1b[31m',
		green: '\x1b[32m',
		yellow: '\x1b[33m',
		blue: '\x1b[34m',
		magenta: '\x1b[35m',
		cyan: '\x1b[36m',
		white: '\x1b[37m',
		bgBlack: '\x1b[40m',
		bgRed: '\x1b[41m',
		bgGreen: '\x1b[42m',
		bgYellow: '\x1b[43m',
		bgBlue: '\x1b[44m',
		bgMagenta: '\x1b[45m',
		bgCyan: '\x1b[46m',
		bgWhite: '\x1b[47m'
	};

	const styledStrings = strings.map((str) => {
		// You can use color codes directly in the string for applying multiple colors
		// Example: `colors.green + "Hello" + colors.reset + " World"`
		return str.replace(
			/(\[[a-zA-Z]+\])/g,
			(match) => colors[match.replace(/[^\w]/g, '')] || match
		);
	});

	console.log(...styledStrings, colors.reset); // Reset color after the log
};
