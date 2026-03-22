import fs from "fs";
import { decodeGithubFileContent } from "../api-client.js";
import { githubGetContents } from "../github-rest.js";
import {
  findGitRoot,
  parseRepoFullName,
  readStackFile,
  stackJsonPath,
  validateStackDoc
} from "../nugit-stack.js";

/**
 * Load stack.json from GitHub Contents API.
 * @param {string} repoFull owner/repo
 * @param {string} ref branch or sha
 */
export async function fetchStackDocFromGithub(repoFull, ref) {
  const { owner, repo } = parseRepoFullName(repoFull);
  const item = await githubGetContents(owner, repo, ".nugit/stack.json", ref);
  const text = decodeGithubFileContent(item);
  if (!text) {
    throw new Error("Could not decode .nugit/stack.json from GitHub");
  }
  const doc = JSON.parse(text);
  validateStackDoc(doc);
  return doc;
}

/**
 * If document is a propagated prefix, fetch full stack from layer.tip.head_branch.
 * @param {Record<string, unknown>} doc
 */
export async function expandStackDocIfPrefix(doc) {
  const layer = doc.layer;
  if (!layer || typeof layer !== "object" || !layer.tip || typeof layer.tip !== "object") {
    return doc;
  }
  const tip = /** @type {{ head_branch?: string }} */ (layer.tip);
  const stackSize = layer.stack_size;
  const prs = doc.prs;
  if (
    typeof stackSize !== "number" ||
    !Array.isArray(prs) ||
    prs.length >= stackSize ||
    typeof tip.head_branch !== "string" ||
    !tip.head_branch.trim()
  ) {
    return doc;
  }
  const { owner, repo } = parseRepoFullName(doc.repo_full_name);
  const item = await githubGetContents(
    owner,
    repo,
    ".nugit/stack.json",
    tip.head_branch.trim()
  );
  const text = decodeGithubFileContent(item);
  if (!text) {
    return doc;
  }
  try {
    const full = JSON.parse(text);
    validateStackDoc(full);
    return full;
  } catch {
    return doc;
  }
}

/**
 * @param {{ root?: string | null, repo?: string, ref?: string, file?: string }} opts
 */
export async function loadStackDocForView(opts) {
  let doc = null;
  const root = opts.root ?? findGitRoot();

  if (opts.file) {
    const raw = fs.readFileSync(opts.file, "utf8");
    doc = JSON.parse(raw);
    validateStackDoc(doc);
  } else if (opts.repo && opts.ref) {
    doc = await fetchStackDocFromGithub(opts.repo, opts.ref);
  } else if (root) {
    const p = stackJsonPath(root);
    if (!fs.existsSync(p)) {
      throw new Error(`No ${p}; run nugit init or pass --repo OWNER/REPO --ref BRANCH`);
    }
    doc = readStackFile(root);
    if (!doc) {
      throw new Error("Empty stack file");
    }
    validateStackDoc(doc);
  } else {
    throw new Error(
      "Not in a git repo: pass --file path/to/stack.json or --repo owner/repo --ref branch"
    );
  }

  doc = await expandStackDocIfPrefix(doc);
  return { doc, root: root || null };
}
