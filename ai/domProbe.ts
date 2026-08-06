import type { Page } from '@playwright/test';
import type { DomElementSummary } from './types';

/**
 * Corre dentro del browser (Playwright serializa esta función con page.evaluate, mandando solo
 * su código fuente). No puede referenciar nada del scope de Node/TS fuera de sus parámetros.
 *
 * tsx compila con esbuild `keepNames: true`, que envuelve toda función/const nombrada interna
 * (isVisible, labelTextFor, etc.) en un helper `__name(fn, "nombre")` para preservar `.name` en
 * stack traces. Ese helper vive en el bundle de Node, no en el string serializado que llega al
 * browser — por eso el primer statement define un polyfill identidad antes de que se lo necesite.
 */
const extractCandidateElements = (): Array<Omit<DomElementSummary, 'suggestedLocator' | 'strength'>> => {
  (globalThis as unknown as { __name?: (fn: unknown, name?: string) => unknown }).__name ??= (fn) => fn;

  // Interactivos (para steps que actúan) + cualquier elemento con data-test/data-testid (para
  // steps que verifican texto — precios, nombres, etc. — que no son clickeables pero sí están
  // instrumentados a propósito para testing, como en el resto de este repo).
  const SELECTOR = 'button, a[href], input, select, textarea, [role], label, [data-test], [data-testid]';
  const IMPLICIT_ROLE: Record<string, string> = {
    button: 'button',
    a: 'link',
    select: 'combobox',
    textarea: 'textbox',
  };
  const INPUT_ROLE: Record<string, string> = {
    checkbox: 'checkbox',
    radio: 'radio',
    submit: 'button',
    button: 'button',
    text: 'textbox',
    email: 'textbox',
    password: 'textbox',
    search: 'textbox',
    number: 'textbox',
  };

  const isVisible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const labelTextFor = (el: Element): string | null => {
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    const closestLabel = el.closest('label');
    if (closestLabel?.textContent?.trim()) return closestLabel.textContent.trim();
    return null;
  };

  const accessibleNameFor = (el: Element): string | null => {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel?.trim()) return ariaLabel.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      if (text) return text;
    }

    const label = labelTextFor(el);
    if (label) return label;

    const text = el.textContent?.trim();
    if (text) return text.slice(0, 80);

    const placeholder = el.getAttribute('placeholder');
    if (placeholder?.trim()) return placeholder.trim();

    const value = (el as HTMLInputElement).value;
    if (value?.trim()) return value.trim();

    return null;
  };

  const roleFor = (el: Element): string | null => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type || 'text';
      return INPUT_ROLE[type] ?? 'textbox';
    }
    return IMPLICIT_ROLE[tag] ?? null;
  };

  const elements = Array.from(document.querySelectorAll(SELECTOR));
  return elements.filter(isVisible).map((el) => ({
    tag: el.tagName.toLowerCase(),
    role: roleFor(el),
    accessibleName: accessibleNameFor(el),
    id: el.getAttribute('id'),
    dataTest: el.getAttribute('data-test') ?? el.getAttribute('data-testid'),
    placeholder: el.getAttribute('placeholder'),
    text: el.textContent?.trim().slice(0, 80) || null,
  }));
};

function escapeForSingleQuotedString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildSuggestedLocator(raw: Omit<DomElementSummary, 'suggestedLocator' | 'strength'>): { suggestedLocator: string; strength: 'strong' | 'weak' } {
  if (raw.role && raw.accessibleName) {
    return {
      suggestedLocator: `page.getByRole('${raw.role}', { name: '${escapeForSingleQuotedString(raw.accessibleName)}' })`,
      strength: 'strong',
    };
  }
  // getByLabel solo tiene sentido para controles de formulario — un div/span con data-test
  // (precio, nombre, etc.) puede tener accessibleName (su propio texto) sin ser "etiquetable".
  if (raw.accessibleName && ['input', 'select', 'textarea'].includes(raw.tag)) {
    return { suggestedLocator: `page.getByLabel('${escapeForSingleQuotedString(raw.accessibleName)}')`, strength: 'strong' };
  }
  if (raw.placeholder) {
    return { suggestedLocator: `page.getByPlaceholder('${escapeForSingleQuotedString(raw.placeholder)}')`, strength: 'strong' };
  }
  if (raw.dataTest) {
    return { suggestedLocator: `page.locator('[data-test="${escapeForSingleQuotedString(raw.dataTest)}"]')`, strength: 'strong' };
  }
  if (raw.id) {
    return { suggestedLocator: `page.locator('#${escapeForSingleQuotedString(raw.id)}')`, strength: 'strong' };
  }
  if (raw.text) {
    return { suggestedLocator: `page.getByText('${escapeForSingleQuotedString(raw.text)}')`, strength: 'weak' };
  }
  return { suggestedLocator: `page.locator('${raw.tag}')`, strength: 'weak' };
}

/**
 * Digest del DOM real, tomado en el momento exacto del flujo donde hace falta un selector.
 * El LLM elige entre estos `suggestedLocator` ya armados (deterministas) en vez de redactar
 * el suyo — misma idea que el catálogo de steps, aplicada a selectores.
 */
export async function captureCandidateElements(page: Page): Promise<DomElementSummary[]> {
  const rawElements = await page.evaluate(extractCandidateElements);

  const withLocators = rawElements
    .map((raw) => ({ ...raw, ...buildSuggestedLocator(raw) }))
    .filter((el) => el.accessibleName || el.dataTest || el.id || el.placeholder || el.text);

  const counts = new Map<string, number>();
  for (const el of withLocators) counts.set(el.suggestedLocator, (counts.get(el.suggestedLocator) ?? 0) + 1);

  return withLocators.map((el) => ({
    ...el,
    // Si el mismo locator matchearía a más de un elemento visible, no es único: se degrada a 'weak'.
    strength: (counts.get(el.suggestedLocator) ?? 1) > 1 ? 'weak' : el.strength,
  }));
}
