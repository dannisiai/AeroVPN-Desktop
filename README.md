# AeroVPN Desktop

This repository builds the AeroVPN Windows client and uses the companion
[AeroVPN-Dashboard](https://github.com/dannisiai/AeroVPN-Dashboard) repository
for its desktop interface. Original license and copyright notices are retained
with the source.

The client adds AeroVPN account sign-in and server-managed connection handling.
The API endpoint is defined in `src/main/aeroAuth.ts`; access tokens are kept
in Windows secure storage.

## Build a Windows installer on GitHub

Open **Actions**, choose **Build Windows x64 installer**, and select **Run
workflow**. The job checks out this repository and its dashboard submodule,
builds the connection service from its pinned source revision, and uploads the
x64 AeroVPN installer as a 30-day artifact.

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
