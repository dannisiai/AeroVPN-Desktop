# AeroVPN Desktop

This repository contains the AeroVPN Windows Electron client and its desktop
interface in `dashboard/`. Dashboard sources and the terminal themes needed by
the build are included directly; no Dashboard repository or Git submodule
checkout is required. Original license and copyright notices are retained.

The client adds AeroVPN account sign-in and server-managed connection handling.
The API endpoint is defined in `src/main/aeroAuth.ts`; access tokens are kept
in Windows secure storage.

## Build a Windows installer on GitHub

Open **Actions**, choose **Build Windows x64 installer**, and select **Run
workflow**. The job checks out this repository with its bundled dashboard,
builds the connection service from its pinned source revision, and uploads the
x64 AeroVPN installer as a 30-day artifact.

The current Windows installer is also available from the repository's
[latest release](https://github.com/dannisiai/AeroVPN-Desktop/releases/latest).

The `ci-input/windows/x64` folder contains the signed third-party Windows
drivers needed by the installer. Their versions, sources, checksums, and license
references are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

```
Copyright (C) 2022 by nekohasekai <contact-sagernet@sekai.icu>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
```
