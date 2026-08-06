import { readFileSync, writeFileSync } from 'node:fs';

export const AI_MARKER_PREFIX = '// Generado por IA (ai:generate --implement-missing) — revisar';
export const AI_UNVERIFIED_PREFIX = '// AVISO IA: no se pudo verificar automáticamente tras varios intentos — revisar manualmente';

/** Cuenta llaves ignorando el contenido de strings ('/"/`) para no cortar mal si un selector generado tiene '{' en un valor. */
function findMatchingBrace(content: string, openIndex: number): number {
  let depth = 0;
  let inString: string | null = null;

  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`No se encontró la llave de cierre a partir del índice ${openIndex}`);
}

function findClassRange(content: string, className: string): { openBrace: number; closeBrace: number } {
  const classMatch = content.match(new RegExp(`export class ${className}\\b[^{]*{`));
  if (!classMatch || classMatch.index === undefined) {
    throw new Error(`No se encontró "export class ${className}" en el archivo`);
  }
  const openBrace = classMatch.index + classMatch[0].length - 1;
  return { openBrace, closeBrace: findMatchingBrace(content, openBrace) };
}

function findConstructorRange(content: string, classRange: { openBrace: number; closeBrace: number }): { openBrace: number; closeBrace: number } {
  const classBody = content.slice(classRange.openBrace, classRange.closeBrace);
  const ctorMatch = classBody.match(/constructor\s*\([^)]*\)\s*{/);
  if (!ctorMatch || ctorMatch.index === undefined) {
    throw new Error('No se encontró el constructor de la clase');
  }
  const openBrace = classRange.openBrace + ctorMatch.index + ctorMatch[0].length - 1;
  return { openBrace, closeBrace: findMatchingBrace(content, openBrace) };
}

function ensureImport(content: string, importLine: string): string {
  if (content.includes(importLine)) return content;
  const lastImportMatch = [...content.matchAll(/^import .+;$/gm)].pop();
  if (!lastImportMatch || lastImportMatch.index === undefined) {
    return `${importLine}\n${content}`;
  }
  const insertAt = lastImportMatch.index + lastImportMatch[0].length;
  return `${content.slice(0, insertAt)}\n${importLine}${content.slice(insertAt)}`;
}

function insertLocatorField(content: string, classRange: { openBrace: number; closeBrace: number }, fieldDeclaration: string): string {
  const classBody = content.slice(classRange.openBrace, classRange.closeBrace);
  const fieldLines = [...classBody.matchAll(/^(\s*private readonly \w+: Locator;)$/gm)];
  if (fieldLines.length === 0) {
    // No hay campos previos: insertamos justo después de la apertura de la clase.
    const insertAt = classRange.openBrace + 1;
    return `${content.slice(0, insertAt)}\n  ${fieldDeclaration}${content.slice(insertAt)}`;
  }
  const last = fieldLines[fieldLines.length - 1];
  const insertAt = classRange.openBrace + last.index! + last[0].length;
  return `${content.slice(0, insertAt)}\n  ${fieldDeclaration}${content.slice(insertAt)}`;
}

function insertConstructorAssignment(content: string, className: string, assignmentLine: string): string {
  const classRange = findClassRange(content, className);
  const ctorRange = findConstructorRange(content, classRange);
  const braceLineStart = content.lastIndexOf('\n', ctorRange.closeBrace) + 1;
  return `${content.slice(0, braceLineStart)}    ${assignmentLine}\n${content.slice(braceLineStart)}`;
}

/**
 * Busca un método (por nombre) dentro de la clase, incluyendo un comentario de marca IA
 * inmediatamente anterior si existe, para poder reemplazarlo entero (stub -> implementación real,
 * o implementación fallida -> nuevo intento).
 */
function findMethodBoundaries(
  content: string,
  className: string,
  methodName: string,
): { start: number; end: number } | null {
  const classRange = findClassRange(content, className);
  const classBody = content.slice(classRange.openBrace, classRange.closeBrace);
  const methodMatch = classBody.match(new RegExp(`async\\s+${methodName}\\s*\\([^)]*\\)[^{]*{`));
  if (!methodMatch || methodMatch.index === undefined) return null;

  const methodOpenBrace = classRange.openBrace + methodMatch.index + methodMatch[0].length - 1;
  const methodCloseBrace = findMatchingBrace(content, methodOpenBrace);

  const methodKeywordIndex = classRange.openBrace + methodMatch.index;
  const asyncLineStart = content.lastIndexOf('\n', methodKeywordIndex) + 1;

  let start = asyncLineStart;
  if (asyncLineStart > 0) {
    const prevLineEnd = asyncLineStart - 1;
    const prevLineStart = content.lastIndexOf('\n', prevLineEnd - 1) + 1;
    const prevLine = content.slice(prevLineStart, prevLineEnd).trim();
    if (prevLine.startsWith('//')) start = prevLineStart;
  }

  return { start, end: methodCloseBrace + 1 };
}

export interface NewPageObjectMember {
  importLine?: string;
  fieldDeclaration?: string;
  constructorAssignment?: string;
  methodCode: string;
}

/** Inserta (import + field + asignación en el constructor + método) un miembro nuevo en un Page Object real. */
export function insertPageObjectMember(filePath: string, className: string, member: NewPageObjectMember): void {
  let content = readFileSync(filePath, 'utf-8');

  if (member.importLine) content = ensureImport(content, member.importLine);

  const classRangeAfterImport = findClassRange(content, className);
  if (member.fieldDeclaration) {
    content = insertLocatorField(content, classRangeAfterImport, member.fieldDeclaration);
  }
  if (member.constructorAssignment) {
    content = insertConstructorAssignment(content, className, member.constructorAssignment);
  }

  const classRange = findClassRange(content, className);
  const indentedMethod = member.methodCode
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');
  content = `${content.slice(0, classRange.closeBrace)}\n${indentedMethod}\n${content.slice(classRange.closeBrace)}`;

  writeFileSync(filePath, content, 'utf-8');
}

/** Reemplaza un método existente (stub <-> implementación real) por código nuevo, marca incluida. */
export function replacePageObjectMethod(filePath: string, className: string, methodName: string, newMethodCode: string): void {
  const content = readFileSync(filePath, 'utf-8');
  const boundaries = findMethodBoundaries(content, className, methodName);
  if (!boundaries) {
    throw new Error(`No se encontró el método "${methodName}" en la clase "${className}" para reemplazar`);
  }
  const indentedMethod = newMethodCode
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');
  const updated = `${content.slice(0, boundaries.start)}${indentedMethod}${content.slice(boundaries.end)}`;
  writeFileSync(filePath, updated, 'utf-8');
}
