import { readFileSync, writeFileSync } from 'node:fs';
import {
  asReadmeWithBrainRegistry,
  getOnePathReadme,
} from './asReadmeWithBrainRegistry';

/**
 * .what = writes the generated brain-registry section into the readme
 * .why = the readme table and the shipped slug ladder used to be two hand-kept
 *   copies, compared by eye. this makes the config the one source, so a new rung
 *   reaches the docs by construction rather than by memory.
 */
export const setReadmeBrainRegistry = (): void => {
  const readme = readFileSync(getOnePathReadme(), 'utf8');
  writeFileSync(
    getOnePathReadme(),
    asReadmeWithBrainRegistry({ readme }),
    'utf8',
  );
};
