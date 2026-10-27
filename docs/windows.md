# Windows

Rillday runs locally without an account or synchronization server. The Windows application stores work in its application profile, independently of browser data.

## Install

1. Download [Rillday for Windows x64](https://github.com/nbsp1221/rillday/releases/latest/download/Rillday_windows_x64_setup.exe).
2. Run the installer and open Rillday.
3. Start using tasks, the calendar, the matrix and habits. Connect a server only if you want synchronization.

The installer uses the Microsoft Edge WebView2 runtime. If it is missing, installation downloads it and needs an internet connection. Once installed, local use works offline.

## Portable download

Download the [Windows x64 portable ZIP](https://github.com/nbsp1221/rillday/releases/latest/download/Rillday_windows_x64_portable.zip), extract the entire archive into a writable local folder and run `rillday-desktop.exe`. Keep `rillday-data-directory` and the `data` folder alongside the executable. The portable download runs the same application as the installer and does not register an installation.

WebView2 must already be installed. If it is missing, install the [Microsoft WebView2 Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) or use the Rillday installer, which handles the runtime check. Local work remains available offline after the runtime is installed.

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

For portable updates, close Rillday and replace only `rillday-desktop.exe` and `LICENSE` from the new archive. Keep your existing `data` folder and `rillday-data-directory` file, which records your selected location.

Before reinstalling Windows or removing application data, export your work from **Settings → Data and backups**. An application export and a server backup protect different copies of your data; synchronization alone is not a backup.

## Storage and offline use

Both downloads support **Settings → Data and backups → Data folder**. This shows the active folder and lets you choose an empty folder or open an existing Rillday data folder. Rillday saves and restarts after confirmation. Switching folders does not copy or merge their contents; the previous folder is preserved.

To relocate your existing work, close every Rillday window, copy the entire data folder to the new local location, then reopen Rillday and select that copy. Do not copy or move a data folder while Rillday is running, share a live folder between computers, or use a folder-sync service to synchronize it. Use Rillday server synchronization between devices.

An existing folder that is missing, unrecognized or unwritable is rejected; Rillday does not silently substitute an empty workspace. Do not remove the `.rillday-data` identity file. If the configured folder becomes unavailable, restore it before reopening the application. Installed versions retain their default Windows application profile unless you select another folder. Portable versions default to the adjacent `data` folder.

Login credentials are held in the operating system's credential store, separately from the data folder. Sign in again after moving your data to another Windows account or computer.

The Windows application and a browser do not share local storage. Connecting both to the same server account joins their synchronized workspaces.

You can edit while the server is unavailable. Changes synchronize after reconnecting. Conflicting edits remain available for review instead of being silently discarded.

Local application data is not an encrypted vault. Protect access to your Windows account and retain exports separately from the application profile.
