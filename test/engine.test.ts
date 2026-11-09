import { describe, expect, it } from 'vitest'
import { finalizePrompts, renderTemplate } from '../src/template/render'
import { TemplateSyntaxError } from '../src/template/parse'
import { env, fixtureDom, NOW, render } from './helpers'

describe('variables', () => {
  it('reads preset variables and the date', () => {
    expect(render('{{title}} on {{domain}}', { title: 'Hello', domain: 'example.com' })).toBe('Hello on example.com')
    expect(render('{{date}}')).toBe('2026-11-09')
    expect(render('{{time}}')).toMatch(/^2026-11-09T14:05:09[+-]\d{2}:\d{2}$/)
    expect(render('[{{missing}}]')).toBe('[]')
  })

  it('reads meta, selector and schema variables from a page', () => {
    const dom = fixtureDom('recipe.html', 'https://smalloven.example/cookies')
    const doc = dom.window.document
    const page = {
      metaTags: [{ name: 'description', property: null, content: 'Chewy cookies' }, { name: null, property: 'og:title', content: 'OG' }],
      schema: JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!)
    }
    expect(render('{{meta:name:description}}', page, doc)).toBe('Chewy cookies')
    expect(render('{{meta:property:og:title}}', page, doc)).toBe('OG')
    expect(render('{{selector:h1}}', page, doc)).toBe('Brown Butter Cookies')
    expect(render('{{selector:ul.ingredients > li|join:"; "}}', page, doc)).toBe('225 g butter; 200 g brown sugar; 2 eggs')
    expect(render('{{selectorHtml:h1}}', page, doc)).toBe('<h1>Brown Butter Cookies</h1>')
    expect(render('{{schema:@Recipe:name}}', page, doc)).toBe('Brown Butter Cookies')
    expect(render('{{schema:@Recipe:author.name}}', page, doc)).toBe('Ada Brooks')
    expect(render('{{schema:@Recipe:recipeIngredient[0]}}', page, doc)).toBe('225 g butter')
    expect(render('{{schema:@Recipe:recipeInstructions[*].text|length}}', page, doc)).toBe('3')
    expect(render('{{schema:recipeYield}}', page, doc)).toBe('24 cookies')
    expect(render('{{schema:@Recipe:totalTime|duration:"H:mm"}}', page, doc)).toBe('1:05')
  })

  it('reads an attribute with selector?attr', () => {
    const dom = fixtureDom('article.html', 'https://quietdesk.example/plain-text')
    expect(render('{{selector:figure img?src}}', {}, dom.window.document)).toBe('https://quietdesk.example/img/desk.jpg')
  })
})

describe('logic', () => {
  it('branches with if, elseif and else', () => {
    const t = '{% if n > 10 %}big{% elseif n > 5 %}mid{% else %}small{% endif %}'
    expect(render(`{% set n = 12 %}${t}`)).toBe('big')
    expect(render(`{% set n = 7 %}${t}`)).toBe('mid')
    expect(render(`{% set n = 1 %}${t}`)).toBe('small')
    expect(render('{% if a %}a{% elif b %}b{% endif %}', { title: '' }).length).toBe(0)
    expect(() => render('{% elif x %}')).toThrow(/outside/)
  })

  it('supports and, or, not, contains and parentheses', () => {
    expect(render('{% if title contains "Review" and not draft %}yes{% endif %}', { title: 'A Review' })).toBe('yes')
    expect(render('{% if (a or b) && !c %}yes{% else %}no{% endif %}')).toBe('no')
    expect(render('{% set tags = ["a","important"] %}{% if tags contains "important" %}yes{% endif %}')).toBe('yes')
    expect(render('{% if title|lower == "home" %}home{% endif %}', { title: 'HOME' })).toBe('home')
    expect(render('{% if words >= 100 %}long{% endif %}', { words: 120 })).toBe('long')
  })

  it('treats empty values as false', () => {
    expect(render('{% if x %}y{% else %}n{% endif %}{% set x = "[]" %}{% if x %}y{% else %}n{% endif %}{% set x = 0 %}{% if x %}y{% else %}n{% endif %}')).toBe('nnn')
  })

  it('loops with the loop object and the _index name', () => {
    const t = '{% set items = ["a","b","c"] %}{% for item in items %}{{loop.index}}{{item}}{% if not loop.last %},{% endif %}{% endfor %}'
    expect(render(t)).toBe('1a,2b,3c')
    expect(render('{% set xs = ["x","y"] %}{% for x in xs %}{{x_index}}{{loop.first}}{% endfor %}')).toBe('0true1false')
    expect(render('{% set xs = ["x","y"] %}{% set ys = ["1","2"] %}{% for x in xs %}{{x}}{{ys[loop.index0]}}{% endfor %}')).toBe('x1y2')
  })

  it('loops over selectors and schema arrays', () => {
    const dom = fixtureDom('recipe.html', 'https://smalloven.example/cookies')
    const doc = dom.window.document
    const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(render('{% for i in selector:li.ingredient %}- {{i}}\n{% endfor %}', {}, doc)).toBe('- 225 g butter\n- 200 g brown sugar\n- 2 eggs\n')
    expect(render('{% for s in schema:@Recipe:recipeInstructions %}{{loop.index}}. {{s.text}}\n{% endfor %}', { schema }, doc)).toContain('2. Beat in the sugar and eggs.')
  })

  it('keeps logic lines out of the output', () => {
    const t = 'Top\n{% if title %}\nTitle: {{title}}\n{% endif %}\nEnd'
    expect(render(t, { title: 'X' })).toBe('Top\nTitle: X\nEnd')
    expect(render(t, { title: '' })).toBe('Top\nEnd')
    expect(render('a {{- " b" -}} c'.replace('" b"', 'title'), { title: 'B' })).toBe('aBc')
  })

  it('sets variables, including inside loops', () => {
    expect(render('{% set slug = title|lower|replace:" ":"-" %}{{slug}}', { title: 'Hello World' })).toBe('hello-world')
    expect(render('{% set n = 0 %}{% for x in ["a","b"] %}{% set n = loop.index %}{% endfor %}{{n}}'.replace('["a","b"]', 'xs'), {})).toBe('0')
  })

  it('falls back with ??', () => {
    expect(render('{{title ?? "Untitled"}}', { title: '' })).toBe('Untitled')
    expect(render('{{title ?? headline ?? "No title"}}', { title: '' })).toBe('No title')
    expect(render('{{title|upper ?? "UNTITLED"}}', { title: 'x' })).toBe('X')
    expect(render('{{title ?? "Untitled"|lower}}', { title: '' })).toBe('untitled')
  })

  it('reports broken templates', () => {
    expect(() => renderTemplate('{% if x %}open', env())).toThrow(TemplateSyntaxError)
    expect(() => renderTemplate('{% endfor %}', env())).toThrow(/without/)
    expect(() => renderTemplate('{% bogus %}', env())).toThrow(/Unknown tag/)
  })

  it('leaves text without tags alone', () => {
    expect(render('Just text, with } and { and %.')).toBe('Just text, with } and { and %.')
  })
})

describe('prompt variables', () => {
  it('leaves prompts in place and lists them, then fills them with their filters', () => {
    const e = env({ title: 'T' })
    const out = renderTemplate('# {{title}}\n{{"a summary of the page"|blockquote}}\n{{"tags as a list"|split:","|wikilink|join:" "}}', e)
    expect(out).toBe('# T\n{{"a summary of the page"|blockquote}}\n{{"tags as a list"|split:","|wikilink|join:" "}}')
    expect(e.prompts.map((p) => p.prompt)).toEqual(['a summary of the page', 'tags as a list'])
    const answers = new Map<string, unknown>([
      ['a summary of the page', 'Short.\nSweet.'],
      ['tags as a list', 'a,b']
    ])
    expect(finalizePrompts(out, e.prompts, answers, { url: '', now: NOW, toMarkdown: (h) => h })).toBe(
      '# T\n> Short.\n> Sweet.\n[[a]] [[b]]'
    )
  })

  it('treats a quoted fallback as a literal, not a prompt', () => {
    const e = env({ title: '' })
    expect(renderTemplate('{{title ?? "Untitled"}}', e)).toBe('Untitled')
    expect(e.prompts).toHaveLength(0)
  })

  it('drops unanswered prompts', () => {
    const e = env()
    const out = renderTemplate('a{{"q"}}b', e)
    expect(finalizePrompts(out, e.prompts, new Map(), { url: '', now: NOW, toMarkdown: (h) => h })).toBe('ab')
  })
})
