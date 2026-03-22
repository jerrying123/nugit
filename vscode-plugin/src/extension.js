const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { startDeviceLogin, listMyPrs, fetchStackForPr } = require("./api-client");

let latestStack = null;

function findGitRoot(startPath) {
  let dir = startPath;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function readLocalStackJson() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    throw new Error("Open a workspace folder first.");
  }
  const root = folders[0].uri.fsPath;
  const gitRoot = findGitRoot(root) || root;
  const filePath = path.join(gitRoot, ".nugit", "stack.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = JSON.parse(raw);
  if (doc.version !== 1 || !Array.isArray(doc.prs)) {
    throw new Error("Invalid .nugit/stack.json");
  }
  return { doc, gitRoot, filePath };
}

class StackTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    if (!latestStack || !latestStack.prs) {
      return [];
    }
    const prs = [...latestStack.prs].sort((a, b) => a.position - b.position);
    return prs.map((pr) => {
      const item = new vscode.TreeItem(`#${pr.pr_number} ${pr.head_branch || ""}`);
      item.description = `pos ${pr.position}`;
      item.tooltip = `${pr.base_branch || ""} · ${pr.status || "open"}`;
      return item;
    });
  }
}

function token() {
  return process.env.NUGIT_USER_TOKEN || process.env.STACKPR_USER_TOKEN || "";
}

function register(context, command, handler) {
  context.subscriptions.push(vscode.commands.registerCommand(command, handler));
}

async function getSecretToken(context) {
  const fromSecret = await context.secrets.get("stackpr.githubToken");
  return fromSecret || process.env.STACKPR_USER_TOKEN || "";
}

function activate(context) {
  const provider = new StackTreeProvider();
  vscode.window.createTreeView("stackpr.stackView", { treeDataProvider: provider });

  register(context, "stackpr.login", async () => {
    const result = await startDeviceLogin();
    vscode.window.showInformationMessage(
      `Open ${result.verification_uri || "GitHub"} and enter code ${result.user_code || ""}`
    );
  });

  register(context, "stackpr.listMyPrs", async () => {
    const t = await getSecretToken(context);
    const result = await listMyPrs(t);
    vscode.window.showInformationMessage(`Found ${result.total_count || 0} pull requests.`);
  });

  register(context, "stackpr.initStackFromPr", async () => {
    const repoFullName = await vscode.window.showInputBox({ prompt: "owner/repo" });
    const createdBy = await vscode.window.showInputBox({ prompt: "GitHub login" });
    if (!repoFullName || !createdBy) {
      return;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showErrorMessage("Open a folder first.");
      return;
    }
    const root = findGitRoot(folders[0].uri.fsPath) || folders[0].uri.fsPath;
    const dir = path.join(root, ".nugit");
    fs.mkdirSync(dir, { recursive: true });
    const doc = {
      version: 1,
      repo_full_name: repoFullName,
      created_by: createdBy,
      prs: [],
      resolution_contexts: []
    };
    const fp = path.join(dir, "stack.json");
    fs.writeFileSync(fp, JSON.stringify(doc, null, 2) + "\n");
    latestStack = doc;
    provider.refresh();
    vscode.window.showInformationMessage(`Wrote ${fp}. Commit and push when ready.`);
  });

  register(context, "stackpr.showStack", async () => {
    try {
      const { doc } = readLocalStackJson();
      latestStack = doc;
      provider.refresh();
      vscode.window.showInformationMessage(`Loaded local stack (${doc.prs.length} PRs).`);
    } catch (e) {
      vscode.window.showErrorMessage(String(e.message || e));
    }
  });

  register(context, "stackpr.fetchRemoteStack", async () => {
    const owner = await vscode.window.showInputBox({ prompt: "Owner" });
    const repo = await vscode.window.showInputBox({ prompt: "Repo" });
    const pr = await vscode.window.showInputBox({ prompt: "PR number in stack" });
    const ref = await vscode.window.showInputBox({ prompt: "Ref (optional, branch/sha)", value: "" });
    if (!owner || !repo || !pr) {
      return;
    }
    const t = await getSecretToken(context);
    if (!t) {
      vscode.window.showErrorMessage(
        "Set NUGIT_USER_TOKEN (or STACKPR_USER_TOKEN) or run StackPR: Save PAT to Secret Storage."
      );
      return;
    }
    try {
      const data = await fetchStackForPr(t, owner, repo, Number(pr), ref || undefined);
      latestStack = {
        version: 1,
        repo_full_name: data.repo_full_name || `${owner}/${repo}`,
        created_by: "",
        prs: (data.prs || []).map((p, i) => ({
          pr_number: p.pr_number,
          position: p.position ?? i,
          head_branch: p.head_branch || "",
          base_branch: p.base_branch || "",
          status: p.status || "open"
        })),
        resolution_contexts: data.resolution_contexts || []
      };
      provider.refresh();
      vscode.window.showInformationMessage(`Loaded remote stack (${latestStack.prs.length} PRs).`);
    } catch (e) {
      vscode.window.showErrorMessage(String(e.message || e));
    }
  });

  register(context, "stackpr.savePat", async () => {
    const pat = await vscode.window.showInputBox({ prompt: "GitHub PAT", password: true });
    if (!pat) {
      return;
    }
    await context.secrets.store("stackpr.githubToken", pat);
    vscode.window.showInformationMessage("PAT stored in VS Code secret storage.");
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
