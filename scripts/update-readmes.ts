import fs from "fs";
import path from "path";

const PACKAGES_DIR = path.resolve(__dirname, "../packages");

const pluginName = process.argv[2];
if (!pluginName) {
  console.error("❌ No plugin name provided.");
  process.exit(1);
}

const pluginDir = path.join(PACKAGES_DIR, pluginName);
const readmePath = path.join(pluginDir, "README.md");
const packageJsonPath = path.join(pluginDir, "package.json");

if (!fs.existsSync(readmePath)) {
  console.error(`❌ README.md not found in ${pluginName}`);
  process.exit(1);
}

if (!fs.existsSync(packageJsonPath)) {
  console.error(`❌ package.json not found in ${pluginName}`);
  process.exit(1);
}

const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
let pkg: { version?: string };

try {
  pkg = JSON.parse(packageJsonContent);
} catch (error) {
  console.error(`❌ Failed to parse package.json for ${pluginName}`);
  process.exit(1);
}

const version = pkg.version;
if (!version) {
  console.error(`❌ No version field in package.json for ${pluginName}`);
  process.exit(1);
}

let readmeContent = fs.readFileSync(readmePath, "utf-8");

if (readmeContent.startsWith("---")) {
  readmeContent = readmeContent.replace(/version:\s*[^\n]+/, `version: ${version}`);
} else {
  const frontmatter = `---\nname: ${pluginName}\ntitle: ${pluginName}\ndescription: Vendure plugin\nversion: ${version}\n---\n\n`;
  readmeContent = frontmatter + readmeContent;
}

fs.writeFileSync(readmePath, readmeContent, "utf-8");
console.log(`✅ Updated README.md for ${pluginName}`);
