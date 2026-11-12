#!/usr/bin/env python3
"""Two-page public summary of the MSc dissertation (the full PDF is shared on request)."""
from pathlib import Path
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
                                Image as RLImage, KeepTogether, FrameBreak, NextPageTemplate)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'reports/dissertation-summary-landslide-kinnaur.pdf'
TMP = Path('/tmp/sumfig'); TMP.mkdir(exist_ok=True)

INK = colors.HexColor('#12161c'); MUTED = colors.HexColor('#55606c'); ACCENT = colors.HexColor('#00698f'); HAIR = colors.HexColor('#d5d9dd')
WARM = colors.HexColor('#8a5a2b')

S = lambda name, **kw: ParagraphStyle(name, **{'fontName': 'Helvetica', 'fontSize': 9.2, 'leading': 12.6, 'textColor': INK, **kw})
kicker = S('k', fontName='Helvetica-Bold', fontSize=7.5, leading=10, textColor=ACCENT)
title = S('t', fontName='Times-Roman', fontSize=21, leading=24.5, spaceAfter=4)
byline = S('b', fontSize=9, leading=12.5, textColor=MUTED)
h3 = S('h', fontName='Helvetica-Bold', fontSize=8.2, leading=11, textColor=WARM, spaceBefore=7, spaceAfter=2)
body = S('p')
bullet = S('li', leftIndent=9, bulletIndent=0, spaceAfter=1.5)
small = S('s', fontSize=7.6, leading=10, textColor=MUTED)
cap = S('c', fontSize=7.8, leading=10.4, textColor=MUTED)
statn = S('sn', fontName='Times-Roman', fontSize=19, leading=21)
statl = S('sl', fontSize=7.6, leading=9.8, textColor=MUTED)


def bullets(items):
    return [Paragraph(i, bullet, bulletText='•') for i in items]


def fig(key, width, max_h):
    im = Image.open(ROOT / f'maps/{key}.webp').convert('RGB')
    p = TMP / f'{key}.jpg'; im.save(p, quality=86)
    w, h = im.size; s = min(width / w, max_h / h)
    return RLImage(str(p), width=w * s, height=h * s)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(HAIR); canvas.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
    canvas.setFont('Helvetica', 7.2); canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9.5 * mm, 'Dhananjay Singh Madaik · MSc Geographical Information Science, The University of Manchester · Public summary')
    canvas.drawRightString(A4[0] - 18 * mm, 9.5 * mm, f'{doc.page} / 2')
    canvas.restoreState()


story = []
story += [Paragraph('MSC DISSERTATION · PUBLIC SUMMARY', kicker), Spacer(0, 4),
          Paragraph('Landslide inventory, susceptibility and exposure along the NH-5 Satluj corridor', title),
          Paragraph('Dhananjay Singh Madaik · The University of Manchester · Supervisor: Dr Matthew Tomkins · Submitted September 2026<br/>'
                    'Study area: Kafaur to Khab, Kinnaur, Himachal Pradesh', byline), Spacer(0, 8)]
stats = [('179', 'landslides hand-digitised in the 1 km corridor'), ('57.0%', 'of them within 300 m of the road'),
         ('91', 'village points inside the corridor'), ('28.7%', 'of Kinnaur classed High or Very High susceptibility')]
t = Table([[Paragraph(n, statn) for n, _ in stats], [Paragraph(l, statl) for _, l in stats]], colWidths=[43.5 * mm] * 4)
t.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, 0), 0.6, HAIR), ('LINEBELOW', (0, 1), (-1, 1), 0.6, HAIR),
                       ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                       ('TOPPADDING', (0, 0), (-1, 0), 7), ('BOTTOMPADDING', (0, 1), (-1, 1), 7)]))
story += [t, Spacer(0, 4)]
story += [Paragraph('NH-5 follows the Satluj Valley through some of the steepest terrain in the western Himalaya. I mapped where slopes have failed along the road, modelled where failure is relatively more likely across the district, and measured which land and villages sit in the way.', body)]
story += [Paragraph('The question', h3), Paragraph('How are landslides distributed along the highway, what pattern of relative susceptibility do terrain and environmental factors produce, and what land and settlements are exposed?', body)]
story += [Paragraph('Data', h3)] + bullets([
    'High-resolution Google Earth imagery, November 2025', 'ALOS DEM, 12.5 m (slope, elevation, aspect, stream order)',
    'Esri / Impact Observatory Sentinel-2 land cover, 10 m', 'Geological Survey of India geology, 1:50,000',
    'NBSS&amp;LUP soil texture, 1:50,000', 'CHRS PERSIANN-CDR precipitation, 2025, 0.25°', 'Survey of India road and village points, 1:50,000'])
story += [Paragraph('What I did', h3)] + bullets([
    'Hand-digitised 179 landslide polygons from November 2025 imagery inside a 1,000 m corridor around NH-5, and grouped them by area into 58 small, 104 medium and 17 large.',
    'Split the corridor into three non-overlapping bands (0–300, 300–600 and 600–1,000 m) in WGS 1984 UTM zone 44N and counted landslides and landslide area in each band.',
    'Rasterised the landslides at 10 m and overlaid them on Sentinel-2 land cover to measure what they cover, then mapped the village points that fall inside the corridor.',
    'Reclassified eight conditioning factors and combined them in a weighted overlay across 6,482 km<super rise="3" size="6">2</super> of Kinnaur, weighting slope highest (slope 35%, elevation 15%, precipitation 15%, geology 10%, land cover 10%, aspect 5%, soil texture 5%, stream order 5%).',
    'Ran a separate Kriging surface of landslide area and kept it apart from the susceptibility model as an exploratory layer.'])
story += [Paragraph('What I found', h3)] + bullets([
    'Landslides thin out with distance from the road: 102 (57.0%) lie within 300 m, 44 (24.6%) at 300–600 m and 33 (18.4%) at 600–1,000 m.',
    'In the corridor, landslides overlap 6.30 km<super rise="3" size="6">2</super> of land cover, mostly rangeland (58.1%) and bare ground (38.1%). Built-up land makes up 3.1%.',
    '91 village points sit inside the corridor, including Pangi, Powari, Tapri and Urni.',
    'Across Kinnaur, Medium susceptibility covers 44.6% of the district, High 26.1% and Very High 2.6%.'])
story += [Paragraph('Limits I flagged', h3)] + bullets([
    'The susceptibility map is relative and expert-weighted, with no statistical validation such as ROC/AUC, so it shows where conditions combine rather than a probability of failure.',
    'The road-proximity pattern is a spatial association. It does not prove that road construction caused the failures.',
    'My April 2025 field photographs give context only and were not used as validation.'])
story += [Spacer(0, 6), Paragraph('Tools: ArcMap 10.3.1 (Weighted Overlay, Polygon to Raster, Kriging), Google Earth. Coordinate reference: WGS 1984 UTM zone 44N (EPSG:32644).', small)]

# page 2: maps side by side, then the request note
story += [FrameBreak()]
colw = 84 * mm
row = Table([[fig('l-corridor', colw, 168 * mm), fig('l-suscept', colw, 168 * mm)],
             [Paragraph('Mapped landslides within the 1,000 m NH-5 corridor (dissertation Figure 14).', cap),
              Paragraph('Relative landslide susceptibility across Kinnaur from the eight-factor weighted overlay (dissertation Figure 17).', cap)]],
            colWidths=[colw + 4 * mm, colw + 4 * mm])
row.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'BOTTOM'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 1), (-1, 1), 5)]))
story += [Paragraph('KEY MAPS', kicker), Spacer(0, 6), row, Spacer(0, 14)]
note = Table([[Paragraph('<b>Full dissertation available on request.</b> Contact me through my portfolio, dhananjaysmadaik.github.io/orbit, '
                         'and I will share the complete PDF with methods, all figures and references.', body)]], colWidths=[172 * mm])
note.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, ACCENT), ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
                          ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
story += [note]

doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                      title='Landslide inventory, susceptibility and exposure along the NH-5 Satluj corridor: public summary',
                      author='Dhananjay Singh Madaik', subject='MSc dissertation summary', creator='', producer='')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate(id='p', frames=[frame], onPage=footer)])
doc.build(story)
print(OUT, OUT.stat().st_size)
