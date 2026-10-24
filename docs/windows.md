# Windows

Rillday runs locally without an account or synchronization server. The Windows application stores work in its application profile, independently of browser data.

## Install

1. Download [Rillday for Windows x64](https://github.com/nbsp1221/rillday/releases/latest/download/Rillday_windows_x64_setup.exe).
2. Run the installer and open Rillday.
3. Start using tasks, the calendar, the matrix and habits. Connect a server only if you want synchronization.

The installer uses the Microsoft Edge WebView2 runtime. If it is missing, installation downloads it and needs an internet connection. Once installed, local use works offline.

Unsigned releases can trigger a Windows SmartScreen warning. Obtain installers only from the [official repository's releases](https://github.com/nbsp1221/rillday/releases). Release assets include `SHA256SUMS`; compare the installer's hash with its entry using PowerShell:

```powershell
Get-FileHash -LiteralPath .\Rillday_windows_x64_setup.exe -Algorithm SHA256
```

A matching checksum checks the download against that release. It is not a publisher signature.

## Connect a server

Open **Settings → Sync**, enter your server's reachable HTTPS address and sign in. The server administrator creates ordinary accounts. If you operate the server yourself, follow the [self-hosting guide](self-hosting.md).

`127.0.0.1` refers to this Windows computer. Use the server's network address when it runs on another computer.

Signing in does not silently replace local work. If this device already contains data, review the choices before adding it to the account or opening server data. When disconnecting, choose whether to keep or remove the device copy. Server originals remain, and unsent edits must be resolved before removing a device copy.

## Updates

Read the release notes, close Rillday and run the new installer. Keep the application profile so local work remains available. Use a server version compatible with the installed client, as described in the release notes.

Before reinstalling Windows or removing application data, export your work from **Settings → Data and backups**. An application export and a server backup protect different copies of your data; synchronization alone is not a backup.

## Storage and offline use

The Windows application and a browser do not share local storage. Connecting both to the same server account joins their synchronized workspaces.

You can edit while the server is unavailable. Changes synchronize after reconnecting. Conflicting edits remain available for review instead of being silently discarded.

Local application data is not an encrypted vault. Protect access to your Windows account and retain exports separately from the application profile.
