import fs from "fs";
import path from "path";

const PACKAGES_DIR = path.resolve(__dirname, "../packages");

function getPluginDirs(): string[] {
  return fs
    .readdirSync(PACKAGES_DIR)
    .filter((dir) => {
      const fullPath = path.join(PACKAGES_DIR, dir);
      return fs.statSync(fullPath).isDirectory();
    });
}

function updateReadmeVersion(pluginName: string) {
  const pluginDir = path.join(PACKAGES_DIR, pluginName);
  const readmePath = path.join(pluginDir, "README.md");
  const packageJsonPath = path.join(pluginDir, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    console.warn(`⚠️ Skipping ${pluginName}: no package.json found.`);
    return;
  }

  if (!fs.existsSync(readmePath)) {
    console.warn(`⚠️ Skipping ${pluginName}: no README.md found.`);
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const version = pkg.version;

  if (!version) {
    console.warn(`⚠️ Skipping ${pluginName}: no version in package.json.`);
    return;
  }

  let readmeContent = fs.readFileSync(readmePath, "utf-8");

  if (readmeContent.startsWith("---")) {
    // Replace the version field inside frontmatter
    readmeContent = readmeContent.replace(
      /version:\s*[^\n]+/,
      `version: ${version}`
    );
  } else {
    // Inject frontmatter
    const frontmatter = `---\nname: ${pluginName}\ntitle: ${pluginName}\ndescription: Vendure plugin\nversion: ${version}\n---\n\n`;
    readmeContent = frontmatter + readmeContent;
  }

  fs.writeFileSync(readmePath, readmeContent, "utf-8");
  console.log(`✅ Updated README.md for ${pluginName}`);
}

function main() {
  const plugins = getPluginDirs();
  plugins.forEach(updateReadmeVersion);
}

main();
