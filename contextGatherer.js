const fs = require('fs').promises;
const path = require('path');
const logger = require('./log');

const MAX_CONTEXT_SIZE = 50000; // ~50k tokens worth of context

// Helper function to read file safely
async function safeReadFile(filePath) {
	try {
		const content = await fs.readFile(filePath, 'utf8');
		return content;
	} catch (error) {
		return null;
	}
}

// Extract imports from a TypeScript/JavaScript file
function extractImports(content) {
	const importRegex = /import\s+(?:{[^}]+}|[\w\s,*]+)\s+from\s+['"]([^'"]+)['"]/g;
	const imports = [];
	let match;
	while ((match = importRegex.exec(content)) !== null) {
		imports.push(match[1]);
	}
	return imports;
}

// Extract component name from file content
function extractComponentName(content, filePath) {
	// Try to find React component declarations
	const patterns = [
		/export\s+(?:default\s+)?function\s+(\w+)/,
		/export\s+(?:default\s+)?const\s+(\w+)\s*[:=]\s*(?:\([^)]*\)|[^=])*=>/,
		/const\s+(\w+)\s*[:=]\s*(?:\([^)]*\)|[^=])*=>[^;]+export\s+default\s+\1/,
		/class\s+(\w+)\s+extends\s+(?:React\.)?Component/
	];
	
	for (const pattern of patterns) {
		const match = content.match(pattern);
		if (match) return match[1];
	}
	
	// Fallback to filename
	return path.basename(filePath, path.extname(filePath));
}

// Extract props interface/type
function extractPropsType(content) {
	const patterns = [
		/interface\s+(\w*Props)\s*{([^}]+)}/,
		/type\s+(\w*Props)\s*=\s*{([^}]+)}/
	];
	
	for (const pattern of patterns) {
		const match = content.match(pattern);
		if (match) {
			return {
				name: match[1],
				definition: match[0]
			};
		}
	}
	return null;
}

// Extract hooks used in the component
function extractHooks(content) {
	const hookRegex = /use[A-Z]\w*/g;
	const hooks = new Set();
	let match;
	while ((match = hookRegex.exec(content)) !== null) {
		hooks.add(match[0]);
	}
	return Array.from(hooks);
}

// Find files that import a specific file
async function findWhoImports(targetFile, searchDir = '.') {
	const importers = [];
	const targetBaseName = path.basename(targetFile, path.extname(targetFile));
	
	async function searchDirectory(dir) {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				
				// Skip node_modules and other common directories
				if (entry.isDirectory()) {
					if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
						await searchDirectory(fullPath);
					}
				} else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
					const content = await safeReadFile(fullPath);
					if (content && content.includes(targetBaseName)) {
						// More precise check for imports
						const imports = extractImports(content);
						if (imports.some(imp => imp.includes(targetBaseName))) {
							importers.push(fullPath);
						}
					}
				}
			}
		} catch (error) {
			// Silently handle permission errors
		}
	}
	
	await searchDirectory(searchDir);
	return importers.slice(0, 5); // Return top 5 importers
}

// Detect state management usage
function detectStateManagement(content) {
	const patterns = {
		redux: /useSelector|useDispatch|connect\(/,
		zustand: /create\(|useStore/,
		mobx: /observer|observable|makeObservable/,
		context: /useContext|createContext/,
		recoil: /useRecoilState|useRecoilValue|atom\(/
	};
	
	const detected = [];
	for (const [name, pattern] of Object.entries(patterns)) {
		if (pattern.test(content)) {
			detected.push(name);
		}
	}
	return detected;
}

// Gather context for Java/Spring files
async function gatherJavaContext(file, content) {
	const context = [];
	
	// Extract class name
	const classMatch = content.match(/(?:public\s+)?(?:class|interface|enum)\s+(\w+)/);
	if (classMatch) {
		context.push(`Class/Interface: ${classMatch[1]}`);
	}
	
	// Detect Spring annotations
	const springAnnotations = [
		'@RestController', '@Controller', '@Service', '@Repository',
		'@Component', '@Configuration', '@Entity', '@Table'
	];
	const foundAnnotations = springAnnotations.filter(ann => content.includes(ann));
	if (foundAnnotations.length > 0) {
		context.push(`Spring annotations: ${foundAnnotations.join(', ')}`);
	}
	
	// Detect REST endpoints
	const endpointMatches = content.match(/@(?:Get|Post|Put|Delete|Patch|Request)Mapping\s*\([^)]*\)/g);
	if (endpointMatches) {
		context.push(`REST endpoints: ${endpointMatches.length} defined`);
	}
	
	return context;
}

// Main context gathering function
async function gatherSmartContext(diff, changedFiles) {
	const contexts = [];
	
	try {
		for (const file of changedFiles) {
			// Process TypeScript/JavaScript files
			if (/\.(ts|tsx|js|jsx)$/.test(file)) {
				const content = await safeReadFile(file);
				if (!content) continue;
			
			const fileContext = {
				file,
				componentName: extractComponentName(content, file),
				imports: extractImports(content).filter(imp => imp.startsWith('.')),
				hooks: extractHooks(content),
				props: extractPropsType(content),
				stateManagement: detectStateManagement(content)
			};
			
			// Find who imports this component
			if (fileContext.componentName) {
				fileContext.importedBy = await findWhoImports(file);
			}
			
			// Create a concise context summary
			const contextSummary = [];
			
			if (fileContext.componentName) {
				contextSummary.push(`Component: ${fileContext.componentName}`);
			}
			
			if (fileContext.importedBy && fileContext.importedBy.length > 0) {
				contextSummary.push(`Used by: ${fileContext.importedBy.map(f => path.basename(f)).join(', ')}`);
			}
			
			if (fileContext.hooks.length > 0) {
				contextSummary.push(`Hooks: ${fileContext.hooks.join(', ')}`);
			}
			
			if (fileContext.props) {
				contextSummary.push(`Props interface: ${fileContext.props.name}`);
			}
			
			if (fileContext.stateManagement.length > 0) {
				contextSummary.push(`State management: ${fileContext.stateManagement.join(', ')}`);
			}
			
			if (contextSummary.length > 0) {
				contexts.push(`\n### Context for ${path.basename(file)}:\n${contextSummary.join('\n')}`);
			}
		}
		
		// Process Java files
		if (/\.java$/.test(file)) {
			const content = await safeReadFile(file);
			if (!content) continue;
			
			const javaContext = await gatherJavaContext(file, content);
			if (javaContext.length > 0) {
				contexts.push(`\n### Context for ${path.basename(file)}:\n${javaContext.join('\n')}`);
			}
		}
		}
		
		// For CSS/SCSS changes, try to find the component
		const styleFiles = changedFiles.filter(f => /\.(css|scss|sass|less)$/.test(f));
		for (const styleFile of styleFiles) {
			const baseName = path.basename(styleFile, path.extname(styleFile));
			const possibleComponent = changedFiles.find(f => 
				f.includes(baseName) && /\.(tsx?|jsx?)$/.test(f)
			);
			
			if (possibleComponent) {
				contexts.push(`\n### Style context:\n${path.basename(styleFile)} belongs to ${path.basename(possibleComponent)}`);
			}
		}
		
	} catch (error) {
		logger(`[yellow]Warning: Error gathering smart context: ${error.message}`);
	}
	
	// Trim context if it's too large
	let contextString = contexts.join('\n');
	if (contextString.length > MAX_CONTEXT_SIZE) {
		contextString = contextString.substring(0, MAX_CONTEXT_SIZE) + '\n... (context trimmed)';
	}
	
	return contextString;
}

// Lock file patterns to exclude from context
const LOCK_FILE_PATTERNS = [
	/package-lock\.json$/,
	/yarn\.lock$/,
	/pnpm-lock\.yaml$/,
	/composer\.lock$/,
	/Gemfile\.lock$/,
	/Pipfile\.lock$/,
	/poetry\.lock$/,
	/cargo\.lock$/i,
	/go\.sum$/,
	/mix\.lock$/
];

// Check if a file is a lock file
function isLockFile(filePath) {
	return LOCK_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

// Extract changed files from git diff
function extractChangedFiles(diff) {
	const files = [];
	const diffLines = diff.split('\n');

	for (const line of diffLines) {
		if (line.startsWith('diff --git')) {
			const match = line.match(/b\/(.+)$/);
			if (match) {
				const filePath = match[1];
				// Exclude lock files from being processed
				if (!isLockFile(filePath)) {
					files.push(filePath);
				}
			}
		}
	}

	return files;
}

// Filter lock files from git diff content
function filterLockFilesFromDiff(diff) {
	const lines = diff.split('\n');
	const filteredLines = [];
	let skipCurrentFile = false;

	for (const line of lines) {
		if (line.startsWith('diff --git')) {
			const match = line.match(/b\/(.+)$/);
			if (match && isLockFile(match[1])) {
				skipCurrentFile = true;
				continue;
			} else {
				skipCurrentFile = false;
				filteredLines.push(line);
			}
		} else if (!skipCurrentFile) {
			filteredLines.push(line);
		}
	}

	return filteredLines.join('\n');
}

module.exports = {
	gatherSmartContext,
	extractChangedFiles,
	filterLockFilesFromDiff
};