// Filters, checked against the documented examples of each family.

import { describe, expect, it } from 'vitest'
import { render } from './helpers'

const r = (src: string, vars: Record<string, unknown> = {}) =>
  render(`{% set _ = 0 %}${src}`, { ...(vars as object) })

const withVars = (src: string, vars: Record<string, unknown>) => {
  const sets = Object.entries(vars)
    .map(([k, v]) => `{% set ${k} = ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(JSON.stringify(v))} %}`)
    .join('')
  return render(sets + src)
}

describe('date filters', () => {
  it('formats and reads input formats', () => {
    expect(r('{{date|date:"YYYY-MM-DD"}}')).toBe('2026-11-09')
    expect(r('{{"12/01/2024"|date:("YYYY-MM-DD", "MM/DD/YYYY")}}'.replace('{{"', '{{ x ?? "'))).toBe('2024-12-01')
    expect(render('{{published|date:"MMM D, YYYY"}}', { published: '2026-03-14T09:30:00Z' })).toBe('Mar 14, 2026')
  })
  it('leaves an empty date empty', () => {
    expect(render('[{{published|date:"YYYY"}}]', { published: '' })).toBe('[]')
  })
  it('modifies dates', () => {
    expect(withVars('{{d|date_modify:"+1 year"}}', { d: '2024-12-01' })).toBe('2025-12-01')
    expect(withVars('{{d|date_modify:"- 2 months"}}', { d: '2024-12-01' })).toBe('2024-10-01')
  })
  it('formats durations', () => {
    expect(withVars('{{d|duration:"HH:mm:ss"}}', { d: 'PT1H30M' })).toBe('01:30:00')
    expect(withVars('{{d|duration:"H:mm:ss"}}', { d: '3665' })).toBe('1:01:05')
    expect(withVars('{{d|duration}}', { d: 'PT5M3S' })).toBe('05:03')
  })
})

describe('text filters', () => {
  const t = (src: string, s: string) => withVars(src, { s })
  it('changes case', () => {
    expect(t('{{s|capitalize}}', 'hELLO wORLD')).toBe('Hello world')
    expect(t('{{s|title}}', 'hello world')).toBe('Hello World')
    expect(t('{{s|upper}}', 'abc')).toBe('ABC')
    expect(t('{{s|lower}}', 'ABC')).toBe('abc')
    expect(t('{{s|camel}}', 'hello big world')).toBe('helloBigWorld')
    expect(t('{{s|pascal}}', 'hello big world')).toBe('HelloBigWorld')
    expect(t('{{s|kebab}}', 'Hello Big World')).toBe('hello-big-world')
    expect(t('{{s|snake}}', 'helloBigWorld')).toBe('hello_big_world')
    expect(t('{{s|uncamel}}', 'camelCase')).toBe('camel case')
    expect(t('{{s|uncamel}}', 'PascalCase')).toBe('pascal case')
    expect(t('{{s|trim}}', ' hello world ')).toBe('hello world')
  })
  it('replaces plainly, in pairs and with regex', () => {
    expect(t('{{s|replace:",":""}}', 'a,b,c')).toBe('abc')
    expect(t('{{s|replace:("e":"a","o":"0")}}', 'hello world')).toBe('hall0 w0rld')
    expect(t('{{s|replace:"/[aeiou]/g":"*"}}', 'hello world')).toBe('h*ll* w*rld')
    expect(t('{{s|replace:"/hello/i":"hi"}}', 'HELLO world')).toBe('hi world')
    expect(t('{{s|replace:("/[aeiou]/g":"*","/\\s+/":"-")}}', 'hello world')).toBe('h*ll*-w*rld')
    expect(t('{{s|replace:"\\:":" -"}}', 'a:b')).toBe('a -b')
  })
  it('decodes and unescapes', () => {
    expect(t('{{s|decode_uri}}', 'hello%20world')).toBe('hello world')
    expect(t('{{s|decode_uri}}', '%E0%A4%A')).toBe('%E0%A4%A')
    expect(t('{{s|unescape}}', 'say \\"hi\\"\\nok')).toBe('say "hi"\nok')
  })
  it('makes safe names', () => {
    expect(t('{{s|safe_name}}', 'Why? A: guide / part #2 [draft]')).toBe('Why A guide part 2 draft')
    expect(t('{{s|safe_name:windows}}', 'CON')).toBe('_CON')
    expect(t('{{s|safe_name:mac}}', 'a:b/c?')).toBe('abc?')
  })
})

describe('formatting filters', () => {
  it('quotes and makes callouts', () => {
    expect(withVars('{{s|blockquote}}', { s: 'a\nb' })).toBe('> a\n> b')
    expect(withVars('{{s|callout:("tip", "Title", true)}}', { s: 'Body' })).toBe('> [!tip]- Title\n> Body')
    expect(withVars('{{s|callout}}', { s: 'Body' })).toBe('> [!info]\n> Body')
  })
  it('makes footnotes, images, links and wikilinks', () => {
    expect(withVars('{{a|footnote}}', { a: ['first item', 'second item'] })).toBe('[^1]: first item\n\n[^2]: second item')
    expect(withVars('{{o|footnote}}', { o: { 'First Note': 'Content 1' } })).toBe('[^first-note]: Content 1')
    expect(withVars('{{s|image:"alt text"}}', { s: 'image.jpg' })).toBe('![alt text](image.jpg)')
    expect(withVars('{{s|link:"author"}}', { s: 'https://x.test' })).toBe('[author](https://x.test)')
    expect(withVars('{{s|wikilink}}', { s: 'page' })).toBe('[[page]]')
    expect(withVars('{{s|wikilink:"alias"}}', { s: 'page' })).toBe('[[page|alias]]')
    expect(withVars('{{a|wikilink|join:", "}}', { a: ['A', 'B'] })).toBe('[[A]], [[B]]')
    expect(withVars('{{o|wikilink|join}}', { o: { Page: 'Alias' } })).toBe('[[Page|Alias]]')
  })
  it('makes lists and tables', () => {
    expect(withVars('{{a|list}}', { a: ['x', 'y'] })).toBe('- x\n- y')
    expect(withVars('{{a|list:task}}', { a: ['x'] })).toBe('- [ ] x')
    expect(withVars('{{a|list:numbered}}', { a: ['x', 'y'] })).toBe('1. x\n2. y')
    expect(withVars('{{a|list:numbered-task}}', { a: ['x'] })).toBe('1. [ ] x')
    expect(withVars('{{a|table}}', { a: [{ n: 'a', v: 1 }, { n: 'b', v: 2 }] })).toBe('| n | v |\n| --- | --- |\n| a | 1 |\n| b | 2 |')
    expect(withVars('{{a|table}}', { a: ['x', 'y'] })).toBe('| Value |\n| --- |\n| x |\n| y |')
    expect(withVars('{{a|table:("A", "B")}}', { a: [1, 2, 3, 4] })).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')
  })
  it('makes text fragment links', () => {
    const out = render('{{highlights|fragment_link}}', {
      url: 'https://example.com/post#top',
      highlights: [{ id: '1', text: 'a well-known line', html: '', timestamp: '', kind: 'text', anchor: { start: 0, end: 1, prefix: '', suffix: '' } }]
    })
    expect(out).toBe('a well-known line [link](https://example.com/post#:~:text=a%20well%2Dknown%20line)')
  })
})

describe('number filters', () => {
  it('calculates, rounds and formats', () => {
    expect(withVars('{{n|calc:"+10"}}', { n: 5 })).toBe('15')
    expect(withVars('{{n|calc:"**3"}}', { n: 2 })).toBe('8')
    expect(withVars('{{n|calc:"+1"}}', { n: 'abc' })).toBe('abc')
    expect(withVars('{{n|round}}', { n: 3.7 })).toBe('4')
    expect(withVars('{{n|round:2}}', { n: 3.14159 })).toBe('3.14')
    expect(withVars('{{n|number_format:2}}', { n: 1234.567 })).toBe('1,234.57')
    expect(withVars('{{n|number_format:(2,".",",")}}', { n: 1234.567 })).toBe('1.234,57')
    expect(withVars('{{s|length}}', { s: 'hello' })).toBe('5')
    expect(withVars('{{a|length}}', { a: ['a', 'b', 'c'] })).toBe('3')
    expect(withVars('{{o|length}}', { o: { a: 1, b: 2 } })).toBe('2')
  })
})

describe('HTML filters', () => {
  const h = (src: string, html: string) => withVars(src, { h: html })
  it('removes and keeps tags and attributes', () => {
    expect(h('{{h|remove_tags:"b"}}', '<p>Hello <b>world</b>!</p>')).toBe('<p>Hello world!</p>')
    expect(h('{{h|strip_tags:("b")}}', '<p>Hello <b>world</b>!</p>')).toBe('Hello <b>world</b>!')
    expect(h('{{h|strip_tags}}', '<p>Hello <b>world</b>!</p>')).toBe('Hello world!')
    expect(h('{{h|remove_attr:"class"}}', '<div class="test" id="example">Content</div>')).toBe('<div id="example">Content</div>')
    expect(h('{{h|strip_attr:("class")}}', '<div class="test" id="example">Content</div>')).toBe('<div class="test">Content</div>')
    expect(h('{{h|remove_html:(".ad,#x,img")}}', '<p>a</p><div class="ad">b</div><img src="x"><span id="x">c</span>')).toBe('<p>a</p>')
    expect(h('{{h|replace_tags:"strong":"h2"}}', '<strong class="c">T</strong>')).toBe('<h2 class="c">T</h2>')
  })
  it('converts to Markdown and JSON', () => {
    expect(h('{{h|markdown}}', '<h2>Title</h2><p>Some <strong>bold</strong> text.</p>')).toBe('## Title\n\nSome **bold** text.')
    expect(h('{{h|html_to_json|first|object:keys|join}}', '<p class="x">Hi</p>')).toBe('tag,attributes,children')
    expect(withVars('{{s|strip_md}}', { s: '# Head\n\n**bold** and [[Page|alias]] and [link](https://x)' })).toBe('Head\n\nbold and alias and link')
  })
})

describe('array and object filters', () => {
  it('picks, joins, splits and slices', () => {
    expect(withVars('{{a|first}}', { a: ['a', 'b', 'c'] })).toBe('a')
    expect(withVars('{{a|last}}', { a: ['a', 'b', 'c'] })).toBe('c')
    expect(withVars('{{a|join}}', { a: ['a', 'b', 'c'] })).toBe('a,b,c')
    expect(withVars('{{a|join:" "}}', { a: ['a', 'b', 'c'] })).toBe('a b c')
    expect(withVars('{{a|join:"\\n"}}', { a: ['a', 'b'] })).toBe('a\nb')
    expect(withVars('{{s|split:","|slice:1,3|join:" "}}', { s: 'a,b,c,d' })).toBe('b c')
    expect(withVars('{{s|split|join:"-"}}', { s: 'abc' })).toBe('a-b-c')
    expect(withVars('{{s|split:[0-9]|length}}', { s: 'a1b2c3' })).toBe('4')
    expect(withVars('{{s|slice:1,4}}', { s: 'hello' })).toBe('ell')
    expect(withVars('{{s|slice:-3}}', { s: 'hello' })).toBe('llo')
    expect(withVars('{{s|slice:0,-2}}', { s: 'hello' })).toBe('hel')
    expect(withVars('{{s|reverse}}', { s: 'abc' })).toBe('cba')
  })
  it('maps, templates and merges', () => {
    const gems = [{ gem: 'obsidian', hardness: 5 }, { gem: 'amethyst', hardness: 7 }]
    expect(withVars('{{a|map:item => item.gem|join:", "}}', { a: gems })).toBe('obsidian, amethyst')
    expect(withVars('{{a|map:item => ({name: item.gem, h: item.hardness})|template:"- ${name} is ${h}\\n"}}', { a: gems })).toBe(
      '- obsidian is 5\n- amethyst is 7\n'
    )
    expect(withVars('{{a|map:item => "genres/${item}"|join}}', { a: ['rock', 'pop'] })).toBe('genres/rock,genres/pop')
    expect(withVars('{{o|template:"${gem.name}"}}', { o: { gem: { name: 'Obsidian' } } })).toBe('Obsidian')
    expect(withVars('{{a|merge:("c","d")|join}}', { a: ['a', 'b'] })).toBe('a,b,c,d')
    expect(withVars('{{a|merge:(\'b,"c,d",e\')|length}}', { a: ['a'] })).toBe('4')
    expect(withVars('{{s|merge:("b","c")|join}}', { s: 'a' })).toBe('a,b,c')
  })
  it('selects with nth, unique and object', () => {
    const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(withVars('{{a|nth:3}}', { a: ten })).toBe('3')
    expect(withVars('{{a|nth:3n|join}}', { a: ten })).toBe('3,6,9')
    expect(withVars('{{a|nth:n+8|join}}', { a: ten })).toBe('8,9,10')
    expect(withVars('{{a|nth:1,2,3:5|join}}', { a: ten })).toBe('1,2,3,6,7,8')
    expect(withVars('{{a|unique|join}}', { a: [1, 2, 2, 3, 3] })).toBe('1,2,3')
    expect(withVars('{{o|object:array}}', { o: { a: 1, b: 2 } })).toBe('[["a",1],["b",2]]')
    expect(withVars('{{o|object:values|join}}', { o: { a: 1, b: 2 } })).toBe('1,2')
  })
})
