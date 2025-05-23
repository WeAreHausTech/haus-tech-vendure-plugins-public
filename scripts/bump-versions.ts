import fs from "fs";
import path from "path";
import readline from "readline";

const PACKAGES_DIR = path.join(__dirname, "..", "packages");

function getPlugins(): string[] {
  return fs
    .readdirSync(PACKAGES_DIR)
    .filter((name) =>
      fs.existsSync(path.join(PACKAGES_DIR, name, "package.json")),
    );
}

function bumpVersion(version: string, releaseType: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (releaseType) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const releaseType = await prompt("Bump type (patch / minor / major): ");
  if (!["patch", "minor", "major"].includes(releaseType)) {
    console.error("Invalid bump type.");
    process.exit(1);
  }

  const plugins = getPlugins();
  plugins.forEach((pluginName) => {
    const packagePath = path.join(PACKAGES_DIR, pluginName, "package.json");
    const pkgJson = fs.readFileSync(packagePath, "utf-8");
    const pkg = JSON.parse(pkgJson) as { version: string };

    const oldVersion = pkg.version;
    const newVersion = bumpVersion(oldVersion, releaseType);

    pkg.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

    console.log(`✅ ${pluginName}: ${oldVersion} → ${newVersion}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
