/* eslint-disable no-console */
const spellcheck = require('spellchecker');
const pkg = require('./package.json');
const read = require('fs').promises.readFile;
const sjx = require('shelljs');

sjx.config.silent = true;

const tryToRead = async (path) => {
  try {
    return await read(path);
  } catch (ignored) {
    return '';
  }
};

const asJson = (str) => {
  try {
    const json = JSON.parse(str.toString('utf-8'));
    return [
      ...(json?.['cSpell.words'] || []),
      ...(json?.['cSpell.userWords'] || []),
      ...(json?.['cSpell.ignoreWords'] || [])
    ];
  } catch (ignored) {
    return [];
  }
};

const asText = (str) => str.toString('utf-8').split('\n');
const isPascalCase = (w) => /^([A-Z]{2,}.+|[A-Z][a-z]+[A-Z].*)$/.test(w);
const isCamelCase = (w) => /^[a-z]+[A-Z]+.*$/.test(w);
const isAllCaps = (w) => /^[^a-z]+$/.test(w);

const splitOutWords = (phrase) =>
  [...phrase.split(/[^a-zA-Z]+/g), phrase].filter(Boolean);

const keys = (obj) => Object.keys(obj).map(splitOutWords);

(async () => {
  const lastCommitMsg = (await read('./.git/COMMIT_EDITMSG')).toString('utf-8');
  const homeDir = require('os').homedir();

  const ignoreWords = Array.from(
    new Set(
      [
        ...(await Promise.all([
          tryToRead('./.spellcheckignore').then(asText),
          tryToRead(`${homeDir}/.config/_spellcheckignore`).then(asText),
          tryToRead('./.vscode/settings.json').then(asJson),
          tryToRead(`${homeDir}/.config/Code/User/settings.json`).then(asJson)
        ])),
        ...require('text-extensions'),
        // ? Popular contractions
        ...['ve', 're', 's', 'll', 't', 'd', 'o', 'ol'],
        ...keys(pkg.dependencies),
        ...keys(pkg.devDependencies),
        ...keys(pkg.scripts),
        ...splitOutWords(sjx.exec('git log --format="%B" HEAD~1').stdout).slice(0, -1)
      ]
        .flat()
        .filter(Boolean)
        .map((word) => splitOutWords(word.trim().toLowerCase()))
        .flat()
    )
  );

  const typos = Array.from(
    new Set(
      spellcheck
        .checkSpelling(lastCommitMsg)
        .map((typoLocation) =>
          lastCommitMsg.slice(typoLocation.start, typoLocation.end).trim().split("'")
        )
        .flat()
        .filter((w) => !isAllCaps(w) && !isCamelCase(w) && !isPascalCase(w))
        .map((w) => w.toLowerCase())
        .filter((typo) => !ignoreWords.includes(typo))
    )
  );

  if (typos.length) {
    console.warn('WARNING: there may be misspelled words in your commit message!');
    console.warn('Commit messages can be fixed before push with `git commit -S --amend`');
    console.warn('---');

    for (const typo of typos.slice(0, 5)) {
      const corrections = spellcheck.getCorrectionsForMisspelling(typo);
      const suggestion = corrections.length
        ? ` (did you mean ${corrections.slice(0, 5).join(', ')}?)`
        : '';

      console.warn(`${typo}${suggestion}`);
    }

    typos.length > 5 && console.warn(`${typos.length - 5} more...`);
    typos.length && console.warn('---');
  }
})();