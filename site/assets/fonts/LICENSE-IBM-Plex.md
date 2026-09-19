# Fonts on this site: IBM Plex
Three families, five faces, self-hosted as woff2 in this folder. The site makes no font request to any
third party: there is no Google Fonts link, no CDN, nothing but these files.

## What is here, and where each file came from

Fetched on 2026-09-19 with curl from the official IBM Plex npm packages on jsDelivr. Each file was
checked to be a real woff2 (magic bytes `wOF2`) before it was kept.

| File | Family | Weight | Bytes | npm package | Version |
|---|---|---|---|---|---|
| `IBMPlexSerif-SemiBold.woff2` | IBM Plex Serif | 600 | 73,440 | `@ibm/plex-serif` | 2.0.0 |
| `IBMPlexSans-Regular.woff2` | IBM Plex Sans | 400 | 63,020 | `@ibm/plex-sans` | 1.1.0 |
| `IBMPlexSans-SemiBold.woff2` | IBM Plex Sans | 600 | 67,060 | `@ibm/plex-sans` | 1.1.0 |
| `IBMPlexMono-Regular.woff2` | IBM Plex Mono | 400 | 49,248 | `@ibm/plex-mono` | 2.5.0 |
| `IBMPlexMono-SemiBold.woff2` | IBM Plex Mono | 600 | 50,600 | `@ibm/plex-mono` | 2.5.0 |

### Source URLs

- `IBMPlexSerif-SemiBold.woff2`
  <https://cdn.jsdelivr.net/npm/@ibm/plex-serif@2.0.0/fonts/complete/woff2/IBMPlexSerif-SemiBold.woff2>
- `IBMPlexSans-Regular.woff2`
  <https://cdn.jsdelivr.net/npm/@ibm/plex-sans@1.1.0/fonts/complete/woff2/IBMPlexSans-Regular.woff2>
- `IBMPlexSans-SemiBold.woff2`
  <https://cdn.jsdelivr.net/npm/@ibm/plex-sans@1.1.0/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2>
- `IBMPlexMono-Regular.woff2`
  <https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/fonts/complete/woff2/IBMPlexMono-Regular.woff2>
- `IBMPlexMono-SemiBold.woff2`
  <https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/fonts/complete/woff2/IBMPlexMono-SemiBold.woff2>

### sha256

```
030d808e82f99ebe5c21d50745bd06e5ce16ad9e94b360f5adcc19362beb5344  IBMPlexSerif-SemiBold.woff2
ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a  IBMPlexSans-Regular.woff2
f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205  IBMPlexSans-SemiBold.woff2
ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350  IBMPlexMono-Regular.woff2
6a825b4824c01cbb401e829e5a066a1818411bcb3538b5a5792c5ca9b82343c3  IBMPlexMono-SemiBold.woff2
```

Verify them at any time with `shasum -a 256 site/assets/fonts/*.woff2`.

The complete (not subset) woff2 of each face is used, so every character the site prints is present:
the middle dot in a source line, the curly quotation marks around a young person's words, the arrow on a
door. The five files come to about 300 KB in total, and each one is loaded with `font-display: swap`, so
text is readable before the fonts arrive.

## Licence

IBM Plex is licensed under the SIL Open Font License, Version 1.1. The text below is copied verbatim from
`LICENSE.txt` in `@ibm/plex-serif@2.0.0`; the sans and mono packages carry the same licence.

```
Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"

This Font Software is licensed under the SIL Open Font License, Version 1.1.

This license is copied below, and is also available with a FAQ at: http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
