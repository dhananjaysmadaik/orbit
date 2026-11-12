#!/usr/bin/env python3
"""Assembles index.html from the chapter data below, the recovered v2 fragments and the
legacy stylesheet/script, then bundles the 3D scene with esbuild. Run from anywhere:
    python3 src/build.py            (GitHub version, self-hosted fonts, strict CSP)
"""
import json, re, subprocess, sys, hashlib
from pathlib import Path
from html import escape

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
TOOLS = Path('/home/claude/tools')
F = json.loads((SRC / 'fragments.json').read_text())

ARROW = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>'
DOWN = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>'


def fig(key):
    """Re-use the exact figure markup (caption, sizes) from the case studies."""
    m = re.search(r'<figure class="fig">(?:(?!</figure>).)*?maps/%s\.webp.*?</figure>' % re.escape(key), F['cases'], re.S)
    if not m:
        sys.exit('missing figure ' + key)
    return m.group(0)


def stats_of(case_id):
    art = re.search(r'<article class="case-src"[^>]*id="%s".*?(?=<article class="case-src"|$)' % case_id, F['cases'], re.S).group(0)
    m = re.search(r'<div class="stats[^"]*">(.*?)</div>\s*(?=<|$)', art, re.S)
    pairs = re.findall(r'<b>(.*?)</b>\s*<span>(.*?)</span>', art[:art.find('The question')], re.S)
    return pairs


def card_summary(case_id):
    blob = F['featured'] + F['grid']
    m = re.search(r'data-case="%s"[^>]*>.*?</a>\s*</h3>\s*<p>(.*?)</p>' % case_id, blob, re.S)
    return m.group(1)


SITES = {
    'orbit':      dict(lat=53.48, lon=-2.24),
    'himachal':   dict(lat=31.9, lon=77.2),
    'kinnaur':    dict(lat=31.62, lon=78.2),
    'rome':       dict(lat=41.9, lon=12.45),
    'valencia':   dict(lat=39.4, lon=-0.38),
    'cornwall':   dict(lat=50.32, lon=-4.97),
    'manchester': dict(lat=53.48, lon=-2.24),
}

def dms(lat, lon):
    def f(v, p, n):
        d = abs(v); deg = int(d); mi = round((d - deg) * 60)
        if mi == 60: deg += 1; mi = 0
        return f"{deg}°{mi:02d}′{p if v >= 0 else n}"
    return f"{f(lat, 'N', 'S')} {f(lon, 'E', 'W')}"

CHAPTERS = [
    dict(id='orbit', short='Orbit', place='Low Earth orbit', kind='intro'),
    dict(id='himachal', short='Himachal Pradesh', place='Himachal Pradesh, India', case='ndvi',
         cat='Landsat time series', date='Jan 2026',
         title='Two decades of <em>vegetation loss and recovery.</em>',
         figs=['n-period', 'n-hotspots', 'n-study'], scan='NDVI change', ground=None),
    dict(id='kinnaur', short='Kinnaur', place='NH-5 Satluj corridor, Kinnaur', case='landslide',
         cat='MSc dissertation', date='Sep 2026',
         title='179 landslides along <em>one Himalayan highway.</em>',
         figs=['l-suscept', 'l-inventory', 'l-study'], scan='Terrain and slope',
         ground=dict(img='assets/scenes/kinnaur.webp', w=1920, h=1246, cap=None, key='l-photos')),
    dict(id='rome', short='Rome', place='Italy and Vatican City', case='python',
         cat='Python', date='Nov 2025 – Jan 2026',
         title='The world’s shortest border, <em>found in code.</em>',
         figs=['b-map', 't-final', 't-raw'], scan='Geodesic distance', ground=None),
    dict(id='valencia', short='Valencia', place='Valencia Province, Spain', case='valencia',
         cat='SAR flood mapping', date='Jun 2026',
         title='Mapping a flood <em>through the cloud.</em>',
         figs=['s-compare', 's-cems', 's-post'], scan='Radar backscatter',
         ground=dict(slider=True)),
    dict(id='cornwall', short='Cornwall', place='Cornwall, United Kingdom', case='uav',
         cat='UAV survey', date='Jan 2026',
         title='Do beavers reshape <em>the canopy?</em>',
         figs=['u-w1', 'u-top1', 'u-felling'], scan='UAV orthomosaic',
         ground=dict(img='assets/scenes/cornwall.webp', w=1920, h=1113, key='u-w1')),
    dict(id='manchester', short='Manchester', place='Greater Manchester, UK', case=['greenspace', 'westgorton'],
         cat='Suitability modelling · Research placement', date='Jan – Apr 2026',
         title='Evidence for <em>greener, fairer streets.</em>',
         figs=['g-classified', 'p-mobility', 'g-priority'], scan='Census mosaic', ground=None),
    dict(id='contact', short='Contact', place='Manchester, United Kingdom', kind='outro'),
]

CASE_TITLE = {}
for m in re.finditer(r'<article class="case-src" data-title="([^"]*)" hidden="" id="(\w+)"', F['cases']):
    CASE_TITLE[m.group(2)] = m.group(1)


def caption_of(key):
    return re.search(r'<figcaption>(.*?)</figcaption>', fig(key), re.S).group(1)


def stats_html(pairs):
    return '<div class="ch-stats">' + ''.join(f'<div><b>{b}</b><span>{s}</span></div>' for b, s in pairs) + '</div>'


def chapter_html(i, ch):
    n = f'{i + 1:02d}'
    s = SITES[ch['id'] if ch['id'] in SITES else 'orbit']
    coord = dms(s['lat'], s['lon'])
    attrs = f'id="ch-{ch["id"]}" class="chapter ch-{ch.get("kind", "project")}" data-ch="{i}" data-short="{escape(ch["short"])}" data-place="{escape(ch["place"])}"'
    if ch.get('kind') == 'intro':
        return f'''
<section {attrs} aria-labelledby="hero-title">
  <div class="pane">
    <div class="panel">
      <p class="kicker"><span class="num">{n}</span><span>GIS · Earth observation · UAV survey · Manchester, UK</span></p>
      <h1 class="display" id="hero-title">Reading the land from <em>orbit, air and ground.</em></h1>
      <p class="lead">I’m Dhananjay Singh Madaik, an MSc Geographical Information Science graduate from the University of Manchester with a forestry degree behind me. I map landslides, track vegetation change from satellites, survey woodland by drone and turn census data into evidence people can act on.</p>
      <div class="ctas">
        <a class="btn btn-primary" href="#ch-himachal" data-jump="1">Begin the journey {DOWN}</a>
        <a class="btn btn-ghost" href="#work">Project archive</a>
      </div>
      <ul class="legend-strip" aria-label="Portfolio at a glance">
        <li><b>179</b><span>landslides hand-digitised along NH-5, Kinnaur</span></li>
        <li><b>2000–2024</b><span>Landsat NDVI record, Himachal Pradesh</span></li>
        <li><b>2</b><span>woodlands surveyed by UAV, Cornwall</span></li>
        <li><b>12</b><span>LSOAs harmonised for a Manchester park study</span></li>
      </ul>
    </div>
    <p class="hint label" aria-hidden="true"><span class="hint-drag">Drag the Earth to turn it</span><span class="hint-sat">Click the satellite to scan</span></p>
  </div>
</section>'''
    if ch.get('kind') == 'outro':
        return f'''
<section {attrs} aria-labelledby="contact-title">
  <div class="pane">
    <div class="panel" id="contact">
      <p class="kicker"><span class="num">{n}</span><span>Contact</span><span>{coord}</span></p>
      <h2 class="h2" id="contact-title">Looking for graduate roles in <em>GIS, remote sensing and survey.</em></h2>
      <p class="lead">{F['contact_lead']}</p>
      {F['contact_card']}
      <p class="label more"><a href="#work">Browse the full project archive, experience and toolkit {DOWN}</a></p>
    </div>
  </div>
</section>'''

    cases = ch['case'] if isinstance(ch['case'], list) else [ch['case']]
    leads = ''.join(f'<p class="lead">{card_summary(c)}</p>' for c in cases)
    if len(cases) == 1:
        pairs = stats_of(cases[0])
    else:
        pairs = stats_of(cases[0])[:2] + stats_of(cases[1])[:2]
    btns = ''.join(
        f'<a class="btn btn-primary" href="#{c}" data-case="{c}">{"Read the case study" if len(cases) == 1 else escape(short)} {ARROW}</a>'
        for c, short in zip(cases, ['Green space case study', 'West Gorton case study']))
    if ch['id'] == 'kinnaur':
        btns += f'<a class="btn btn-ghost" href="reports/dissertation-landslide-kinnaur.pdf" target="_blank" rel="noopener noreferrer">Dissertation (PDF)</a>'
    figs = ''.join(fig(k) for k in ch['figs'])
    ground = ''
    g = ch.get('ground')
    if g and g.get('slider'):
        ground = f'''
    <div class="ground ground-sar" aria-label="Before and after radar comparison">
      <div class="sar" id="sar">
        <img src="assets/scenes/valencia-pre.webp" width="1006" height="614" alt="Sentinel-1 VH backscatter over Valencia before the flood, 19 October 2024." loading="lazy" decoding="async">
        <div class="sar-after" id="sar-after"><img src="assets/scenes/valencia-post.webp" width="1006" height="614" alt="Sentinel-1 VH backscatter after the flood, 31 October 2024. Dark areas show standing water." loading="lazy" decoding="async"></div>
        <span class="sar-tag l label">Before · 19 Oct 2024</span><span class="sar-tag r label">After · 31 Oct 2024</span>
        <div class="sar-handle" aria-hidden="true"></div>
        <input class="sar-range" id="sar-range" type="range" min="0" max="100" value="50" aria-label="Drag to compare radar images before and after the flood">
      </div>
      <p class="ground-cap label">Sentinel-1 VH backscatter, before and after. Contains modified Copernicus Sentinel data (2024).</p>
    </div>'''
    elif g:
        cap = caption_of(g['key'])
        ground = f'''
    <div class="ground ground-img" aria-hidden="true"><img src="{g['img']}" width="{g['w']}" height="{g['h']}" alt="" loading="lazy" decoding="async"></div>
    <p class="ground-cap label">{cap}</p>'''
    head = f'<p class="kicker"><span class="num">{n}</span><span>{escape(ch["place"])}</span><span class="coord">{coord}</span></p>'
    title_attr = escape(CASE_TITLE[cases[0]])
    return f'''
<section {attrs} aria-labelledby="t-{ch["id"]}"{' data-ground="1"' if g else ''}>
  <div class="pane">{ground}
    <div class="panel">
      {head}
      <p class="cat label">{ch['cat']} · {ch['date']}</p>
      <h2 class="h2" id="t-{ch["id"]}">{ch['title']}</h2>
      <div class="phases">
        <div class="ph ph-intro">{leads}</div>
        <div class="ph ph-work">
          {stats_html(pairs)}
          <div class="plate" data-title="{title_attr}">{figs}</div>
          <div class="ctas">{btns}</div>
        </div>
      </div>
    </div>
    <p class="scan-tag label" aria-hidden="true">Satellite pass · {ch['scan']} <span>· illustrative</span></p>
  </div>
</section>'''


def nav_items():
    out = []
    for i, ch in enumerate(CHAPTERS):
        out.append(f'<li><a href="#ch-{ch["id"]}" data-jump="{i}"><span class="num">{i + 1:02d}</span><span>{escape(ch["short"])}</span></a></li>')
    return ''.join(out)


def build(target='github'):
    chapters = ''.join(chapter_html(i, c) for i, c in enumerate(CHAPTERS))
    ticks = ''.join(
        f'<a class="tick" href="#ch-{c["id"]}" data-jump="{i}" aria-label="Chapter {i + 1:02d}: {escape(c["short"])}"><span>{i + 1:02d}</span><i>{escape(c["short"])}</i></a>'
        for i, c in enumerate(CHAPTERS))
    markers = ''.join(
        f'<button type="button" class="marker" data-jump="{i}" data-site="{c["id"]}" tabindex="-1" aria-hidden="true"><i></i><span>{escape(c["short"])}</span></button>'
        for i, c in enumerate(CHAPTERS) if c.get('kind') is None)
    site_json = json.dumps([dict(id=c['id'], short=c['short'], place=c['place'], **SITES[c['id'] if c['id'] in SITES else 'orbit']) for c in CHAPTERS])

    if target == 'github':
        csp = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
               "script-src 'self'; connect-src 'self'; media-src 'none'; frame-src 'none'; object-src 'none'; "
               "base-uri 'none'; form-action 'none'")
        head_extra = f'<meta http-equiv="Content-Security-Policy" content="{csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">\n<link rel="stylesheet" href="assets/site.css?v={{V}}">'
    else:
        head_extra = '<link rel="stylesheet" href="assets/site.css?v={V}">'

    html = f'''<!doctype html>
<html lang="en-GB" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Dhananjay Singh Madaik · GIS and Earth observation</title>
<meta name="description" content="GIS and Earth observation portfolio of Dhananjay Singh Madaik, MSc Geographical Information Science, University of Manchester: landslide mapping, Landsat time series, SAR flood mapping, UAV survey, census analysis and Python.">
<meta name="theme-color" content="#04070c">
<meta name="color-scheme" content="dark">
{head_extra}
<link rel="preload" href="assets/fonts/fraunces-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%23173a5e'/%3E%3Cpath d='M7 16a9 9 0 0 0 18 0' fill='%23E5E4E2' opacity='.5'/%3E%3Cellipse cx='16' cy='16' rx='15' ry='5' fill='none' stroke='%239FD6EC' stroke-width='1.4' transform='rotate(-24 16 16)'/%3E%3C/svg%3E">
<script src="assets/boot.js?v={{V}}"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<div class="loader" id="loader" aria-hidden="true">
  <div class="loader-in">
    <p class="label">Acquiring signal</p>
    <p class="loader-name">Dhananjay <em>Singh Madaik</em></p>
    <div class="loader-bar"><i id="loader-bar"></i></div>
    <p class="label loader-pct"><span id="loader-pct">0</span>%</p>
  </div>
</div>

<div class="stage" id="stage" aria-hidden="true">
  <canvas id="scene"></canvas>
  <div class="markers" id="markers">{markers}</div>
  <button type="button" class="sat-tag" id="sat-tag" tabindex="-1"><i></i><span>Scan</span></button>
  <div class="veil" id="veil"></div>
</div>
<div class="cut" id="cut" aria-hidden="true"></div>

<header class="topbar">
  <a class="wordmark" href="#ch-orbit" data-jump="0">Dhananjay <em>Singh Madaik</em></a>
  <nav class="topnav" aria-label="Primary">
    <a href="#ch-orbit" data-jump="0">The journey</a>
    <a href="#work">Project archive</a>
    <a href="#experience">Experience</a>
    <a href="#contact" data-jump="7">Contact</a>
  </nav>
  <p class="status label"><i></i>Open to graduate roles</p>
  <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="index-panel"><span class="label">Index</span><b aria-hidden="true"><i></i><i></i></b></button>
</header>

<div class="index-panel" id="index-panel" hidden>
  <div class="index-in">
    <div>
      <p class="label">The journey</p>
      <ol class="index-list">{nav_items()}</ol>
    </div>
    <div>
      <p class="label">Archive</p>
      <ul class="index-list small">
        <li><a href="#work">All seven projects</a></li>
        <li><a href="#experience">Experience</a></li>
        <li><a href="#toolkit">Toolkit</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="https://dhananjaysmadaik.github.io/" target="_blank" rel="noopener noreferrer">Classic version of this site {ARROW}</a></li>
      </ul>
      <div class="index-utils" id="index-utils"><p class="label">Settings</p></div>
    </div>
  </div>
</div>

<aside class="readout" id="readout" aria-hidden="true">
  <p class="label ro-place" id="ro-place">Low Earth orbit</p>
  <dl>
    <div><dt>LAT</dt><dd id="ro-lat">—</dd></div>
    <div><dt>LON</dt><dd id="ro-lon">—</dd></div>
    <div><dt>ALT</dt><dd id="ro-alt">—</dd></div>
  </dl>
  <p class="label ro-scan" id="ro-scan">Satellite idle</p>
</aside>

<div class="hud" id="hud">
  <p class="scroll-hint label" aria-hidden="true"><i></i>Scroll to travel</p>
  <nav class="ticks" aria-label="Chapters">{ticks}<span class="track" aria-hidden="true"><i id="track-fill"></i></span></nav>
  <div class="utils">
    <button type="button" class="util" id="btn-scan" aria-label="Task the satellite to scan this area">Scan</button>
    <button type="button" class="util" id="btn-sound" aria-pressed="false">Sound <span>off</span></button>
    <button type="button" class="util" id="btn-motion" aria-pressed="false">Motion <span>on</span></button>
    <button type="button" class="util" id="btn-quality">Quality <span>auto</span></button>
  </div>
</div>

<main id="main">
<div class="journey" id="journey">{chapters}
</div>

<div class="dossier">
<section class="band" id="work" aria-labelledby="work-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="label">Project archive</p>
      <h2 class="h2" id="work-title">Seven projects, <em>from Himalayan slopes to Manchester streets.</em></h2>
      <p class="lead">Each case study sets out the question, the data, what I did, what I found and the limits, with every map at full size.</p>
    </div>
    {F['filters']}
    <p class="label count" id="work-count" aria-live="polite">Showing 7 projects</p>
    {F['featured']}
    {F['grid']}
    <p class="empty" id="work-empty" hidden>No projects match this filter.</p>
  </div>
</section>

<section class="band" id="experience" aria-labelledby="xp-title">
  <div class="wrap xp">
    <div class="sec-head">
      <p class="label">Experience</p>
      <h2 class="h2" id="xp-title">Field, office <em>and research.</em></h2>
      <p class="lead">{F['experience_lead']}</p>
    </div>
    <div>{F['experience']}</div>
  </div>
</section>

<section class="band" id="toolkit" aria-labelledby="kit-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="label">Toolkit</p>
      <h2 class="h2" id="kit-title">What I <em>work with.</em></h2>
      <p class="lead">{F['toolkit_lead']}</p>
    </div>
    {F['toolkit']}
  </div>
</section>

<section class="band" id="about" aria-labelledby="about-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="label">About</p>
      <h2 class="h2" id="about-title">A forester who <em>learned to map from above.</em></h2>
    </div>
    {F['about']}
  </div>
</section>

<footer class="band site-foot">
  <div class="wrap">
    <div class="foot-row">
      <a class="wordmark" href="#ch-orbit" data-jump="0">Dhananjay <em>Singh Madaik</em></a>
      <nav aria-label="Footer"><ul><li><a href="#work">Work</a></li><li><a href="#experience">Experience</a></li><li><a href="#toolkit">Toolkit</a></li><li><a href="#about">About</a></li><li><a href="#contact" data-jump="7">Contact</a></li><li><a href="https://www.linkedin.com/in/dhananjaysinghmadaik/" target="_blank" rel="noopener noreferrer">LinkedIn</a></li><li><a href="https://github.com/dhananjaysmadaik" target="_blank" rel="noopener noreferrer">GitHub</a></li><li><a href="https://dhananjaysmadaik.github.io/" target="_blank" rel="noopener noreferrer">Classic site</a></li></ul></nav>
    </div>
    <div class="attrib">{F['attrib']}
      <p>Globe imagery: NASA Blue Marble and Black Marble (NASA Earth Observatory), via the three-globe project. Coastlines: Natural Earth. The satellite scans are illustrative visual effects, not data products. Built with three.js.</p>
      <p>© <span id="year">2026</span> Dhananjay Singh Madaik. Manchester, United Kingdom.</p>
    </div>
  </div>
</footer>
</div>
</main>

<div class="cases" id="cases">{F['cases']}</div>
{F['case_dialog']}
{F['lightbox']}
<script type="application/json" id="chapter-data">{site_json}</script>
<script src="assets/site.js?v={{V}}" defer></script>
<script src="assets/app.js?v={{V}}" defer></script>
</body>
</html>
'''
    return html


def bundle():
    import os
    env = dict(os.environ, NODE_PATH=str(TOOLS / 'node_modules'))
    subprocess.run([str(TOOLS / 'node_modules/.bin/esbuild'), str(SRC / 'app.js'), '--bundle', '--minify', '--format=iife',
                    '--target=es2019', '--legal-comments=eof', '--log-level=warning', f'--outfile={ROOT / "assets/app.js"}'],
                   check=True, env=env)


def write_static():
    css = (SRC / 'fonts.css').read_text() + '\n' + (SRC / 'legacy.css').read_text() + '\n' + (SRC / 'cinema.css').read_text()
    (ROOT / 'assets/site.css').write_text(css)
    (ROOT / 'assets/site.js').write_text((SRC / 'site.js').read_text())
    (ROOT / 'assets/boot.js').write_text(
        "document.documentElement.className='js';try{if(!window.WebGLRenderingContext)document.documentElement.className+=' no-webgl'}catch(e){}\n")


if __name__ == '__main__':
    bundle()
    write_static()
    h = hashlib.sha1()
    for p in ['assets/app.js', 'assets/site.css', 'assets/site.js', 'assets/boot.js']:
        h.update((ROOT / p).read_bytes())
    v = h.hexdigest()[:8]
    html = build('github').replace('{V}', v)
    (ROOT / 'index.html').write_text(html)
    (ROOT / '.nojekyll').write_text('')
    print('built index.html', len(html), 'version', v)
