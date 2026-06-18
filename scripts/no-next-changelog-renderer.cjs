const DefaultChangelogRenderer = require('nx/release/changelog-renderer').default;

class NoNextChangelogRenderer extends DefaultChangelogRenderer {
  async render() {
    if (typeof this.changelogEntryVersion === 'string' && this.changelogEntryVersion.includes('-next.')) {
      return '';
    }

    return super.render();
  }
}

module.exports = NoNextChangelogRenderer;
module.exports.default = NoNextChangelogRenderer;