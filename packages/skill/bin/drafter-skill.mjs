#!/usr/bin/env node
import { install, TOOL_TARGETS } from '../src/install.mjs';

function usage() {
  console.error(`Usage: drafter-skill install [--tool ${Object.keys(TOOL_TARGETS).join('|')}|all] [--target <dir>]

Installs the draft-pr and split-scope skills into your AI agent's skill directory.
With no --tool flag, installs into every known tool's directory that this CLI
knows about (whether or not that tool is actually installed on this machine —
harmless no-op directory creation for tools you don't use).

Examples:
  drafter-skill install                    # install into all known tool directories
  drafter-skill install --tool claude       # install into ~/.claude/skills only
  drafter-skill install --target ./my-dir   # copy into an arbitrary directory instead
`);
}

function parseArgs(argv) {
  const parsed = { command: argv[0], tools: [], target: undefined };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--tool') {
      const value = argv[++i];
      if (!value) throw new Error('--tool requires a value');
      if (value !== 'all') parsed.tools.push(value);
    } else if (argv[i] === '--target') {
      parsed.target = argv[++i];
      if (!parsed.target) throw new Error('--target requires a value');
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return parsed;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] !== 'install') {
    usage();
    process.exit(argv.length === 0 ? 1 : 2);
  }

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(2);
  }

  try {
    const results = install({ tools: parsed.tools, target: parsed.target });
    for (const result of results) {
      console.log(`Installed into ${result.target}:`);
      for (const dir of result.installed) console.log(`  ${dir}`);
    }
  } catch (error) {
    console.error(`drafter-skill install failed: ${error.message}`);
    process.exit(1);
  }
}

main();
