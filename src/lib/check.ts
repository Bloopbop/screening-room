// The device check in Settings: can this phone read and write the vault,
// read barcodes, reach Open Library, and keep its storage?

import { GitHub, type VaultRepo } from './github';
import { byIsbn } from './openlibrary';
import { canScan } from './scanner';
import { isVaultFile } from './vault';

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export const CHECK_PATH = '.screening-room-check';
const SAMPLE_ISBN = '9780141439518';

export async function deviceCheck(repo: VaultRepo): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const github = new GitHub(repo);

  let branch = '';
  let leftover = '';
  try {
    branch = await github.branch();
    const tree = await github.tree(branch);
    const count = (folder: string) => tree.entries.filter((e) => e.path.startsWith(folder) && e.path.endsWith('.md') && isVaultFile(e.path)).length;
    leftover = tree.entries.find((e) => e.path === CHECK_PATH)?.sha ?? '';
    const found = [
      `${count('wiki/shelved/')} read`,
      `${count('wiki/to-be-read/')} to read`,
      `${count('wiki/currently-reading/')} reading`,
      tree.entries.some((e) => e.path === 'feed/latest.md') ? 'a feed' : 'no feed',
    ];
    results.push({ name: 'Reading the vault', status: 'pass', detail: `${repo.owner}/${repo.repo} on ${branch}: ${found.join(', ')}.` });
  } catch (error) {
    results.push({ name: 'Reading the vault', status: 'fail', detail: message(error) });
  }

  if (branch) {
    try {
      if (leftover) await github.remove(CHECK_PATH, leftover, 'app: device check (clean up)', branch);
      const { sha } = await github.create(CHECK_PATH, 'Written by the Screening Room app\'s device check, then removed.\n', 'app: device check', branch);
      await github.remove(CHECK_PATH, sha, 'app: device check (clean up)', branch);
      results.push({ name: 'Writing notes', status: 'pass', detail: 'Wrote a check file to the vault and removed it (two small commits).' });
    } catch (error) {
      results.push({ name: 'Writing notes', status: 'fail', detail: message(error) });
    }
  } else {
    results.push({ name: 'Writing notes', status: 'fail', detail: 'Skipped: the vault couldn\'t be read.' });
  }

  results.push(
    (await canScan())
      ? { name: 'Barcode scanning', status: 'pass', detail: 'This browser reads book barcodes (EAN-13).' }
      : { name: 'Barcode scanning', status: 'warn', detail: 'This browser can\'t read barcodes: type ISBNs instead.' },
  );

  try {
    const found = await byIsbn(SAMPLE_ISBN);
    results.push(
      found
        ? { name: 'Book lookups', status: 'pass', detail: `Open Library answered: ${found.title}${found.author ? ` by ${found.author}` : ''}.` }
        : { name: 'Book lookups', status: 'warn', detail: 'Open Library answered, but didn\'t know the sample ISBN.' },
    );
  } catch (error) {
    results.push({ name: 'Book lookups', status: 'fail', detail: message(error) });
  }

  results.push(await storageCheck());
  return results;
}

async function storageCheck(): Promise<CheckResult> {
  if (!navigator.storage?.persist) return { name: 'Storage', status: 'warn', detail: 'This browser can\'t be asked to keep the app\'s storage.' };
  const persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  const estimate = await navigator.storage.estimate?.();
  const used = estimate?.usage != null ? ` About ${Math.max(1, Math.round(estimate.usage / 1_000_000))} MB in use on this site.` : '';
  return persisted
    ? { name: 'Storage', status: 'pass', detail: `Chrome will keep this site's storage.${used}` }
    : {
        name: 'Storage',
        status: 'warn',
        detail: `Chrome may clear this site's storage when space runs low. The vault is safe on GitHub, but unsent notes would be lost. Installing the app usually fixes this.${used}`,
      };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
