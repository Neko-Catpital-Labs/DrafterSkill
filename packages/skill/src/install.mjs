import { existsSync, readFileSync, readdirSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANAGED_PREFIX = 'drafter-';
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKILLS_SOURCE_ROOT = path.join(PACKAGE_ROOT, 'skills');

const TOOL_TARGETS = {
  claude: () => path.join(homedir(), '.claude', 'skills'),
  codex: () => path.join(homedir(), '.codex', 'skills'),
  cursor: () => path.join(homedir(), '.cursor', 'skills-cursor'),
  omp: () => path.join(homedir(), '.omp', 'agent', 'skills'),
};

function listSkillNames() {
  return readdirSync(SKILLS_SOURCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(SKILLS_SOURCE_ROOT, name, 'SKILL.md')));
}

/**
 * Guards against installing a corrupted SKILL.md (missing YAML frontmatter) —
 * every agent runtime rejects one, and a blind copy would propagate the
 * corruption into the user's global skill store. See Invoker's
 * bundled-skills.ts::assertSkillSourceValid for the incident this pattern is
 * ported from (commit fd5c6bbfc there).
 */
function assertSkillSourceValid(sourceDir, skillName) {
  const skillMdPath = path.join(sourceDir, 'SKILL.md');
  const content = readFileSync(skillMdPath, 'utf8');
  const lines = content.split('\n');
  const hasFrontmatter = lines[0]?.trim() === '---' && lines.slice(1).some((line) => line.trim() === '---');
  if (!hasFrontmatter) {
    const preview = content.slice(0, 80).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Skill "${skillName}" has a corrupt SKILL.md at ${skillMdPath}: missing YAML frontmatter delimited by ---. ` +
        `(starts with "${preview}"). Restore it from a clean checkout before installing.`,
    );
  }
}

function installOneTarget(toolName, targetRoot, skillNames) {
  mkdirSync(targetRoot, { recursive: true });
  const installed = [];
  for (const skillName of skillNames) {
    const sourceDir = path.join(SKILLS_SOURCE_ROOT, skillName);
    assertSkillSourceValid(sourceDir, skillName);
    const managedName = `${MANAGED_PREFIX}${skillName}`;
    const destDir = path.join(targetRoot, managedName);
    rmSync(destDir, { recursive: true, force: true });
    cpSync(sourceDir, destDir, { recursive: true, force: true });
    installed.push(destDir);
  }
  return installed;
}

export function install({ tools, target } = {}) {
  const skillNames = listSkillNames();
  if (skillNames.length === 0) {
    throw new Error(`No skills found under ${SKILLS_SOURCE_ROOT}`);
  }

  const requestedTools = tools && tools.length > 0 ? tools : Object.keys(TOOL_TARGETS);
  const results = [];

  if (target) {
    const installed = installOneTarget('custom', path.resolve(target), skillNames);
    results.push({ tool: 'custom', target: path.resolve(target), installed });
    return results;
  }

  for (const tool of requestedTools) {
    const resolver = TOOL_TARGETS[tool];
    if (!resolver) {
      throw new Error(`Unknown --tool "${tool}". Expected one of: ${Object.keys(TOOL_TARGETS).join(', ')}`);
    }
    const targetRoot = resolver();
    const installed = installOneTarget(tool, targetRoot, skillNames);
    results.push({ tool, target: targetRoot, installed });
  }

  return results;
}

export { MANAGED_PREFIX, TOOL_TARGETS, listSkillNames };
