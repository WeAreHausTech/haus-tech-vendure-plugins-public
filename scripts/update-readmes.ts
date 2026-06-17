import fs from 'fs'
import path from 'path'

const PACKAGES_DIR = path.resolve(__dirname, '../packages')

function getPluginDirs(): string[] {
  return fs.readdirSync(PACKAGES_DIR).filter((dir) => {
    const fullPath = path.join(PACKAGES_DIR, dir)
    return fs.statSync(fullPath).isDirectory()
  })
}

/**
 * Derive a plain Markdown README (for npm, which only renders README.md) from the
 * authoritative MDX source (used by the Vendure docs site). The MDX is the single
 * source of truth; README.md is generated and should not be edited by hand.
 */
function generateMarkdownFromMdx(mdxContent: string): string {
  const banner =
    '<!-- This file is generated from README.mdx by scripts/update-readmes.ts. Do not edit by hand. -->\n\n'

  const body = mdxContent
    // Strip the leading docs-site frontmatter block.
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    // Docusaurus `npm2yarn` code-fence meta is not understood by npm/GitHub.
    .replace(/```bash npm2yarn/g, '```bash')
    .replace(/^\s+/, '')

  return banner + body
}

function updateReadmeVersion(pluginName: string) {
  const pluginDir = path.join(PACKAGES_DIR, pluginName)
  const mdxPath = path.join(pluginDir, 'README.mdx')
  const readmePath = fs.existsSync(mdxPath) ? mdxPath : path.join(pluginDir, 'README.md')
  const packageJsonPath = path.join(pluginDir, 'package.json')

  if (!fs.existsSync(packageJsonPath)) {
    console.warn(`⚠️ Skipping ${pluginName}: no package.json found.`)
    return
  }

  if (!fs.existsSync(readmePath)) {
    console.warn(`⚠️ Skipping ${pluginName}: no README.md or README.mdx found.`)
    return
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const version = pkg.version

  if (!version) {
    console.warn(`⚠️ Skipping ${pluginName}: no version in package.json.`)
    return
  }

  let readmeContent = fs.readFileSync(readmePath, 'utf-8')

  if (readmeContent.startsWith('---')) {
    // Replace the version field inside frontmatter
    readmeContent = readmeContent.replace(/version:\s*[^\n]+/, `version: ${version}`)
  } else {
    // Inject frontmatter
    const frontmatter = `---\nname: ${pluginName}\ntitle: ${pluginName}\ndescription: Vendure plugin\nversion: ${version}\n---\n\n`
    readmeContent = frontmatter + readmeContent
  }

  fs.writeFileSync(readmePath, readmeContent, 'utf-8')
  console.log(`✅ Updated README for ${pluginName}`)

  // When the source is MDX, also (re)generate the plain Markdown README that npm renders.
  if (readmePath === mdxPath) {
    const markdownPath = path.join(pluginDir, 'README.md')
    fs.writeFileSync(markdownPath, generateMarkdownFromMdx(readmeContent), 'utf-8')
    console.log(`✅ Generated README.md for ${pluginName}`)
  }
}

function main() {
  const plugins = getPluginDirs()
  plugins.forEach(updateReadmeVersion)
}

main()
