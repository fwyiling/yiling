// Writes the string-built Web Worker sources (deepspaceworker, nebulasworker) to files for reading.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default?.default ?? _traverse.default ?? _traverse;
const [,, inp, outDir] = process.argv;
const ast = parse(readFileSync(inp, 'utf8'), { errorRecovery: true });
const out = {};
traverse(ast, { AssignmentExpression(p) {
  const { left, right, operator } = p.node;
  if (left.type !== 'Identifier' || !/worker$/.test(left.name) || right.type !== 'StringLiteral') return;
  out[left.name] = (operator === '+=' ? out[left.name] ?? '' : '') + right.value;
} });
mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(out)) { writeFileSync(`${outDir}/${k}.js`, v); console.log(k, v.length); }
