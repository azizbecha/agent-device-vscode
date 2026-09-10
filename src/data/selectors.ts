/**
 * agent-device 0.21 selector vocabulary (`@agent-device/selectors`).
 *
 *   key=value [key=value …] [|| key=value …]
 *
 * Space-separated terms AND together; `||` is an ordered fallback chain.
 * Matching is exact after normalization: there is no `~=`, regex, or `nth`.
 */
export interface SelectorKeyDef {
  readonly name: string;
  readonly summary: string;
}

export const SELECTOR_TEXT_KEYS: readonly SelectorKeyDef[] = [
  { name: 'label', summary: 'Accessibility label.' },
  { name: 'id', summary: 'Accessibility / test identifier.' },
  { name: 'text', summary: 'Visible text.' },
  { name: 'role', summary: 'Accessibility role (button, textfield, cell, …).' },
  { name: 'value', summary: 'Current value (text fields, sliders, switches).' },
  { name: 'appname', summary: 'Owning application name (desktop).' },
  { name: 'windowtitle', summary: 'Owning window title (desktop).' },
];

/** Bare boolean terms; `visible` means `visible=true`. */
export const SELECTOR_BOOLEAN_KEYS: readonly SelectorKeyDef[] = [
  { name: 'visible', summary: 'On screen.' },
  { name: 'hidden', summary: 'In the tree but not visible.' },
  { name: 'editable', summary: 'Accepts text input.' },
  { name: 'selected', summary: 'Selected / checked.' },
  { name: 'focused', summary: 'Has keyboard or D-pad focus.' },
  { name: 'enabled', summary: 'Not disabled.' },
  { name: 'hittable', summary: 'Receives touches / clicks.' },
];

export const SELECTOR_TEXT_KEY_SET: ReadonlySet<string> = new Set(
  SELECTOR_TEXT_KEYS.map((k) => k.name),
);
export const SELECTOR_BOOLEAN_KEY_SET: ReadonlySet<string> = new Set(
  SELECTOR_BOOLEAN_KEYS.map((k) => k.name),
);

/** Role words people mistake for keys (`button="Save"`); the hint suggests `role=` / `label=`. */
export const ROLE_HINT_WORDS: readonly string[] = [
  'button',
  'imagebutton',
  'link',
  'cell',
  'statictext',
  'checkedtextview',
  'textfield',
  'textbox',
  'edittext',
  'textarea',
  'switch',
  'slider',
  'image',
  'imageview',
  'webview',
  'framelayout',
  'linearlayout',
  'relativelayout',
  'constraintlayout',
  'viewgroup',
  'view',
  'listview',
  'recyclerview',
  'collectionview',
  'list',
  'searchfield',
  'segmentedcontrol',
  'group',
  'window',
  'checkbox',
  'radio',
  'menuitem',
  'toolbar',
  'scrollarea',
  'scrollview',
  'nestedscrollview',
  'table',
  'application',
  'navigationbar',
  'tabbar',
  'tab',
  'alert',
  'dialog',
  'header',
];

export const ROLE_HINT_WORD_SET: ReadonlySet<string> = new Set(ROLE_HINT_WORDS);

/**
 * Commands whose positionals may be selector expressions, and which
 * positional index (0-based, after the command name) the selector occupies.
 * `null` means "any quoted positional that looks like a selector".
 */
export const SELECTOR_COMMANDS: ReadonlyMap<string, readonly number[] | null> = new Map([
  ['click', [0]],
  ['press', [0]],
  ['tap', [0]],
  ['longpress', [0]],
  ['long-press', [0]],
  ['hover', [0]],
  ['focus', [0]],
  ['fill', [0]],
  ['wait', null],
  ['is', [1]],
  ['get', [1]],
  ['gesture', null],
  ['screenshot', null],
]);
