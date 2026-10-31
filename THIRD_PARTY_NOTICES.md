# Third-party notices

The desktop interface in `dashboard/` was incorporated from AeroVPN-Dashboard
commit `9d5044a0865d2f93950d3647626a4f3c940bfffe`. It retains its original
copyright and license in `dashboard/LICENSE`.

The terminal theme inputs in `dashboard/vendor/iterm2-color-schemes/` are the
Windows Terminal themes from [iTerm2-Color-Schemes](https://github.com/mbadolato/iTerm2-Color-Schemes)
commit `8c84dd1a859f36ec8601b082bd97b4ec888f0f4d`. The collection's MIT license
and individual-theme rights notice are retained alongside the themes.

## Windows driver notices

The files in ci-input/windows/x64 are upstream driver binaries and their
installation metadata. The Windows cloud-build workflow verifies each file
against the SHA-256 values below and checks the Authenticode signatures on
.sys and .cat files before packaging them.

| Files | Upstream/version | License and source |
| --- | --- | --- |
| WinDivert64.sys | WinDivert 2.2.2-A, from the official release archive | Upstream offers LGPL-3.0-or-later or GPL-2.0-only; see the [release](https://github.com/basil00/WinDivert/releases/tag/v2.2.2) and [license](https://github.com/basil00/WinDivert/blob/master/LICENSE). |
| VBoxUSB.sys, VBoxUSBMon.sys, VBoxUSB.inf, VBoxUSB.cat | Oracle VirtualBox 7.2.14, file version 7.2.14.174565 | See the [official VirtualBox source and licensing information](https://www.virtualbox.org/wiki/Licensing_FAQ). |
| usbip2_ude.*, usbip2_filter.* | USB/IP for Windows driver package | BSD-2-Clause; see [vadimgrn/usbip-win2](https://github.com/vadimgrn/usbip-win2) and its [license](https://github.com/vadimgrn/usbip-win2/blob/master/LICENSE). |

## SHA-256 checksums

| File | SHA-256 |
| --- | --- |
| WinDivert64.sys | 8DA085332782708D8767BCACE5327A6EC7283C17CFB85E40B03CD2323A90DDC2 |
| VBoxUSB.sys | 4E60921286307172FD42888CC4855F01CDB5B7BD7A71EEBBA2636093D8742732 |
| VBoxUSB.inf | 21137C65E8856C77414C928D776CC01BAEDD4B7919DD6224A5B715F85A76DF06 |
| VBoxUSB.cat | BB74EDB4AE22B1923AD85E89B119DEEB0103CF124F3C0AEAEBF91D21D16712BA |
| VBoxUSBMon.sys | 9EB9D512E13C8747CEE74057AA6491CB22550F46A7917F03B8EDDFA8B0D78307 |
| usbip2_ude.sys | 51DB440065393E588A6B2585508C50EB3E1510B7B06D9AFA6C5BDE583751EA7D |
| usbip2_ude.inf | 00A1DBFE02C0BBBED38B6E1C81EF0A6DCFE23FE39B07628592167383F7656256 |
| usbip2_ude.cat | A1FDD6612242E14C71D33A3693F3010B1F1ACCB9F6922F0B12543DC5C0217E87 |
| usbip2_filter.sys | C290299FF4D0F6A597DB5CE03E15B29A5349CDCE7C587EBFBD9ECAECA04F73ED |
| usbip2_filter.inf | A149B941D124B9E2F4C503D8AF0C1FDB6907480D372D34B4F76D7452648466A2 |
| usbip2_filter.cat | 02A95969BA033DED3BF9A8C136551697D097DA076C8886630145EF8D39A1DD33
