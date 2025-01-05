const { Command } = require('commander');
const OpenAI = require('openai');
const simpleGit = require('simple-git');
const fs = require('fs');

// Load API key from environment variables or a config file
const { loadCredentials, saveCredentials } = require('./apikey.js');

const credentials = loadCredentials();
const openai = new OpenAI({ apiKey: credentials.openAiApiKey });
const git = simpleGit();

// Extract Jira/GitHub/GitLab ticket from the branch name
function extractTicketFromBranch(branchName) {
	const match = branchName.match(
		/(?:feature|bugfix|hotfix|release)\/([A-Za-z]+-\d+)/
	);
	return match ? match[1] : 'NA-0000'; // Defaults to 'NA-0000' if no ticket found
}

async function generateCommit(diff, ticket) {
	const prompt = `Here is a list of changes detected in a Git repository:\n\n${diff}\n\nPlease generate separate and generate ONE commit. Be profesional, the result must compare to a Senior Developer. Be critic, no need to add 1 commit per file unless the context requires it. Be CONCISE and SHORT, no need to over explain anything, we're dealing with profesionals here. The commit must have a short and concise Git commit message prefixed with the Jira/GitHub/GitLab ticket (${ticket}) and a more detailed description of the changes for the commit.\n\nUse the following format for the output:\nCOMMIT_MESSAGE: <commit message here>\nCOMMIT_DESCRIPTION: <commit description here>\n\nPlease ONLY output what I asked, NO MORE text.`;

	const completion = await openai.chat.completions.create({
		model: 'gpt-4o',
		messages: [{ role: 'user', content: prompt }]
	});

	const commit = completion.choices[0].message.content
		.trim()
		.split('\n')
		.map((line) => line.trim());

	let commitMessage = '';
	let commitDescription = '';

	commit.forEach((line) => {
		if (line.startsWith('COMMIT_MESSAGE:')) {
			commitMessage = line.replace('COMMIT_MESSAGE:', '').trim();
		} else if (line.startsWith('COMMIT_DESCRIPTION:')) {
			commitDescription = line.replace('COMMIT_DESCRIPTION:', '').trim();
		}
	});

	return { commitMessage, commitDescription };
}

async function commitCommand(cmd) {
	try {
		// Step 1: Check if the current directory is a git repository
		const isGitRepo = await git.checkIsRepo();
		if (!isGitRepo) {
			console.log('This is not a Git repository.');
			return;
		}

		// Step 2: Get Git status and current branch
		const diff = await git.diff();
		const branch = await git
			.revparse(['--abbrev-ref', 'HEAD'])
			.catch(() => null);
		if (!branch) {
			console.log('Unable to get current branch name.');
			return;
		}

		const ticket = extractTicketFromBranch(branch); // Extract ticket from branch name
		console.log(diff);

		if (!diff.length) {
			console.log('No changes to commit.');
			return;
		}

		const { commitMessage, commitDescription } = await generateCommit(
			diff,
			ticket
		);

		console.log('Message: ', commitMessage);
		console.log('Description: ', commitDescription);

		if (cmd['dry-run']) {
			console.log('Dry-run enabled. Skipping commit and push.');
			return;
		}

		await git.add('.');

		let commitArgs = `${ticket}: ${commitMessage}\n\n${commitDescription}`;
		if (cmd['no-verify']) {
			commitArgs += ' --no-verify';
		}

		await git.commit(commitArgs);

		await git.push('origin', branch);
		console.log('Batch committed and pushed successfully!');
	} catch (error) {
		console.error('Error:', error.message);
	}
}

async function main() {
	const program = new Command();

	program
		.command('commit')
		.option('--dry-run', 'Perform OpenAI request without git operations')
		.option('--no-verify', 'Skip git commit hooks')
		.action(commitCommand);

	program
		.command('set-openai-key <key>')
		.description('Set the OpenAI API key')
		.action((key) => {
			saveCredentials({ openAiApiKey: key });
			console.log('OpenAI API key saved!');
		});

	program.parse(process.argv);
}

main();
