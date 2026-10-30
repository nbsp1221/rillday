"""Control only fixture-owned windows, isolating local runs from user input."""

import ctypes as c
from ctypes import wintypes as w
from contextlib import ExitStack
import json
import msvcrt
import os
from pathlib import Path
import subprocess
import sys
import traceback
import uuid

CREATE_SUSPENDED = 0x4

for stream in (sys.stdin, sys.stdout, sys.stderr):
    os.set_handle_inheritable(msvcrt.get_osfhandle(stream.fileno()), False)

u = c.WinDLL("user32", use_last_error=True)
k = c.WinDLL("kernel32", use_last_error=True)
shell = c.WinDLL("shell32", use_last_error=True)
shell.IsUserAnAdmin.argtypes = []
shell.IsUserAnAdmin.restype = w.BOOL
callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
u.CreateDesktopW.argtypes = [w.LPCWSTR, w.LPCWSTR, c.c_void_p, w.DWORD, w.DWORD, c.c_void_p]
u.CreateDesktopW.restype = w.HANDLE
u.OpenDesktopW.argtypes = [w.LPCWSTR, w.DWORD, w.BOOL, w.DWORD]
u.OpenDesktopW.restype = w.HANDLE
u.CloseDesktop.argtypes = [w.HANDLE]
u.SetThreadDesktop.argtypes = [w.HANDLE]
u.GetThreadDesktop.argtypes = [w.DWORD]
u.GetThreadDesktop.restype = w.HANDLE
k.GetCurrentThreadId.restype = w.DWORD
k.ResumeThread.argtypes = [w.HANDLE]
k.ResumeThread.restype = w.DWORD
k.WaitForMultipleObjects.argtypes = [w.DWORD, c.POINTER(w.HANDLE), w.BOOL, w.DWORD]
k.WaitForMultipleObjects.restype = w.DWORD
u.OpenInputDesktop.argtypes = [w.DWORD, w.BOOL, w.DWORD]
u.OpenInputDesktop.restype = w.HANDLE
u.GetUserObjectInformationW.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.POINTER(w.DWORD)]
u.EnumDesktopWindows.argtypes = [w.HANDLE, callback_type, w.LPARAM]
u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
u.GetWindowThreadProcessId.restype = w.DWORD
u.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.EnumChildWindows.argtypes = [w.HWND, callback_type, w.LPARAM]
u.GetDlgCtrlID.argtypes = [w.HWND]
u.GetDlgCtrlID.restype = c.c_int
u.SendMessageTimeoutW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM,
                                 w.UINT, w.UINT, c.POINTER(c.c_size_t)]
u.SendMessageTimeoutW.restype = w.LPARAM
u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
k.CloseHandle.argtypes = [w.HANDLE]
k.GetExitCodeProcess.argtypes = [w.HANDLE, c.POINTER(w.DWORD)]
k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
k.OpenProcess.restype = w.HANDLE
k.QueryFullProcessImageNameW.argtypes = [w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD)]
k.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
k.WaitForSingleObject.restype = w.DWORD
class Startup(c.Structure):
    _fields_ = [("cb", w.DWORD), ("reserved", w.LPWSTR), ("desktop", w.LPWSTR),
                ("title", w.LPWSTR), ("x", w.DWORD), ("y", w.DWORD),
                ("width", w.DWORD), ("height", w.DWORD), ("xchars", w.DWORD),
                ("ychars", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
                ("show", w.WORD), ("reserved2size", w.WORD), ("reserved2", c.c_void_p),
                ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE)]


class Process(c.Structure):
    _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE), ("pid", w.DWORD), ("tid", w.DWORD)]


k.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, c.c_void_p, c.c_void_p,
                            w.BOOL, w.DWORD, c.c_void_p, w.LPCWSTR,
                            c.POINTER(Startup), c.POINTER(Process)]


def checked(value):
    if not value:
        raise c.WinError(c.get_last_error())
    return value


def send_message(hwnd, message, wparam, lparam):
    result = c.c_size_t()
    c.set_last_error(0)
    if not u.SendMessageTimeoutW(hwnd, message, wparam, lparam, 0x2, 5000, c.byref(result)):
        raise c.WinError(c.get_last_error() or 1460)


def check_test_binary(executable):
    version = c.WinDLL("version", use_last_error=True)
    version.GetFileVersionInfoSizeW.argtypes = [w.LPCWSTR, c.POINTER(w.DWORD)]
    version.GetFileVersionInfoW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, c.c_void_p]
    version.VerQueryValueW.argtypes = [c.c_void_p, w.LPCWSTR, c.POINTER(c.c_void_p), c.POINTER(w.UINT)]
    unused = w.DWORD()
    size = checked(version.GetFileVersionInfoSizeW(str(executable), c.byref(unused)))
    data = c.create_string_buffer(size)
    checked(version.GetFileVersionInfoW(str(executable), 0, size, data))
    pointer = c.c_void_p()
    length = w.UINT()
    checked(version.VerQueryValueW(data, "\\VarFileInfo\\Translation", c.byref(pointer), c.byref(length)))
    translations = c.cast(pointer, c.POINTER(c.c_ushort))
    for index in range(0, length.value // 2, 2):
        key = f"\\StringFileInfo\\{translations[index]:04x}{translations[index + 1]:04x}\\ProductName"
        if version.VerQueryValueW(data, key, c.byref(pointer), c.byref(length)):
            if c.wstring_at(pointer) == "Rillday Test":
                return
    raise RuntimeError("Native verification requires a Rillday Test executable")


def input_desktop():
    handle = checked(u.OpenInputDesktop(0, False, 1))
    try:
        name = c.create_unicode_buffer(256)
        size = w.DWORD()
        checked(u.GetUserObjectInformationW(handle, 2, name, c.sizeof(name), c.byref(size)))
        return name.value
    finally:
        checked(u.CloseDesktop(handle))


def terminate_owned(pids, executable):
    errors = []
    with ExitStack() as resources:
        handles = []
        for pid in pids:
            try:
                handle = k.OpenProcess(0x1000 | 0x100000, False, pid)
                if not handle and c.get_last_error() == 87:
                    continue
                checked(handle)
                resources.callback(k.CloseHandle, handle)
                exit_code = w.DWORD()
                checked(k.GetExitCodeProcess(handle, c.byref(exit_code)))
                if exit_code.value != 259:
                    continue
                image = c.create_unicode_buffer(32768)
                size = w.DWORD(len(image))
                checked(k.QueryFullProcessImageNameW(handle, 0, image, c.byref(size)))
                assert Path(image.value).resolve() == executable, "Preserve an unrelated process"
                handles.append((pid, handle))
            except BaseException as error:
                errors.append(error)
        if handles:
            assert len(handles) <= 64, "WaitForMultipleObjects supports at most 64 handles"
            values = (w.HANDLE * len(handles))(*(handle for pid, handle in handles))
            state = k.WaitForMultipleObjects(len(handles), values, True, 5000)
            if state == 258:
                # Hold all process handles while terminating the owned trees in one operation.
                arguments = [argument for pid, handle in handles
                             if k.WaitForSingleObject(handle, 0) == 258
                             for argument in ("/PID", str(pid))]
                if arguments:
                    try:
                        subprocess.run(["taskkill.exe", *arguments, "/T", "/F"],
                                       capture_output=True, timeout=10, creationflags=0x08000000)
                    except BaseException as error:
                        errors.append(error)
                state = k.WaitForMultipleObjects(len(handles), values, True, 5000)
            if state == 0xFFFFFFFF:
                errors.append(c.WinError(c.get_last_error()))
            elif state != 0:
                errors.append(RuntimeError("Owned applications did not exit"))
    if errors:
        raise BaseExceptionGroup("Owned application cleanup failed", errors)


def wait_webview(pids):
    handles = []
    try:
        assert 0 < len(pids) <= 64
        for pid in pids:
            handle = k.OpenProcess(0x1000 | 0x100000, False, pid)
            if not handle and c.get_last_error() == 87:
                continue
            checked(handle)
            handles.append(handle)
            exit_code = w.DWORD()
            checked(k.GetExitCodeProcess(handle, c.byref(exit_code)))
            if exit_code.value != 259:
                continue
            image = c.create_unicode_buffer(32768)
            size = w.DWORD(len(image))
            checked(k.QueryFullProcessImageNameW(handle, 0, image, c.byref(size)))
            assert Path(image.value).name.lower() == "msedgewebview2.exe"
        if handles:
            values = (w.HANDLE * len(handles))(*handles)
            if k.WaitForMultipleObjects(len(handles), values, True, 15000) != 0:
                raise RuntimeError("Owned WebView2 processes did not exit")
    finally:
        for handle in handles:
            k.CloseHandle(handle)


root = (Path(os.environ.get("RILLDAY_TEST_OUTPUT", str(Path(__file__).resolve().parents[2] / ".cache" / "tests"))) / "native").resolve()
mode = os.environ.get("RILLDAY_NATIVE_DESKTOP", "isolated")
if mode not in ("isolated", "runner"):
    raise ValueError("Unknown native desktop mode")
runner_desktop = mode == "runner"
# Shared desktops are reserved for disposable hosted VMs, never user sessions.
if runner_desktop and not (os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"):
    raise RuntimeError("The visible desktop is allowed only on GitHub-hosted runners")
owners = {}


def owned_window_pid(hwnd, owner):
    pid = w.DWORD()
    u.GetWindowThreadProcessId(hwnd, c.byref(pid))
    if not pid.value:
        return None
    process = k.OpenProcess(0x1000, False, pid.value)
    if not process:
        if pid.value in owner["pids"] and c.get_last_error() != 87:
            raise c.WinError(c.get_last_error())
        return None
    try:
        image = c.create_unicode_buffer(32768)
        size = w.DWORD(len(image))
        if not k.QueryFullProcessImageNameW(process, 0, image, c.byref(size)):
            return None
        return pid.value if Path(image.value).resolve() == owner["exe"] else None
    finally:
        k.CloseHandle(process)


def release(name):
    owner = owners.get(name)
    if owner:
        # A missing window does not prove that its application process exited.
        terminate_owned(owner["pids"], owner["exe"])
        if owner["desktop"]:
            checked(u.CloseDesktop(owner["desktop"]))
            owner["desktop"] = None
        checked(k.CloseHandle(owner["process"]))
        del owners[name]


def handle(request):
    name = request["desktop"]
    assert name.startswith("RilldayTest-")
    uuid.UUID(name.removeprefix("RilldayTest-"))
    before = input_desktop()
    assert name != before
    original = u.GetThreadDesktop(k.GetCurrentThreadId())
    desktop = None
    failure = None
    desktop_name = before if runner_desktop else name
    result = {"inputBefore": before, "desktop": name, "isolated": not runner_desktop}
    try:
        action = request["action"]
        owner = owners.get(name)
        if request.get("diagnostics") and owner:
            exit_code = w.DWORD()
            checked(k.GetExitCodeProcess(owner["process"], c.byref(exit_code)))
            result["hostPid"] = owner["pid"]
            result["hostExitCode"] = exit_code.value

        if action == "release":
            release(name)
            result["released"] = True
        elif action == "wait-webview":
            wait_webview(request["pids"])
        elif action == "relaunch":
            assert owner, "Preserve an unowned desktop"
            startup = Startup()
            startup.cb = c.sizeof(startup)
            startup.desktop = "WinSta0\\" + desktop_name
            process = Process()
            checked(k.CreateProcessW(str(owner["exe"]), None, None, None, False, 0, None,
                                     str(owner["exe"].parent), c.byref(startup), c.byref(process)))
            owner["pids"].add(process.pid)
            try:
                if k.WaitForSingleObject(process.process, 15000) != 0:
                    raise RuntimeError("A second launch did not return to the running application")
                exit_code = w.DWORD()
                checked(k.GetExitCodeProcess(process.process, c.byref(exit_code)))
                result["exitCode"] = exit_code.value
            finally:
                try:
                    terminate_owned([process.pid], owner["exe"])
                finally:
                    k.CloseHandle(process.thread)
                    k.CloseHandle(process.process)
        elif action == "terminate":
            exe = Path(request["exe"]).resolve()
            assert owner and exe == owner["exe"], "Preserve an unrelated application"
            terminate_owned([request["pid"]], exe)
        elif action == "start":
            exe = Path(request["exe"]).resolve()
            assert exe.is_relative_to(root) and exe.name == "rillday-desktop.exe"
            check_test_binary(exe)
            assert owner is None, "Preserve an existing desktop"
            if runner_desktop:
                creator = checked(u.OpenDesktopW(desktop_name, 0, False, 0xC7))
            else:
                if shell.IsUserAnAdmin():
                    raise RuntimeError("Run local native verification from a non-administrator shell")
                existing = u.OpenDesktopW(name, 0, False, 0xC7)
                if existing:
                    checked(u.CloseDesktop(existing))
                    raise RuntimeError("Preserve an existing desktop")
                creator = checked(u.CreateDesktopW(name, None, None, 0, 0xC7, None))
            startup = Startup()
            startup.cb = c.sizeof(startup)
            startup.desktop = "WinSta0\\" + desktop_name
            startup.flags = 1 | 0x100
            startup.show = 4
            process = Process()
            try:
                # GUI applications otherwise have no stderr for startup failures.
                with (exe.parent / "native-host.log").open("ab", buffering=0) as output, open(os.devnull, "rb") as null:
                    startup.stdin = msvcrt.get_osfhandle(null.fileno())
                    startup.stdout = startup.stderr = msvcrt.get_osfhandle(output.fileno())
                    os.set_handle_inheritable(startup.stdin, True)
                    os.set_handle_inheritable(startup.stdout, True)
                    arguments = (str(exe), None, None, None, True, CREATE_SUSPENDED, None,
                                 str(exe.parent), c.byref(startup), c.byref(process))
                    checked(k.CreateProcessW(*arguments))
            except BaseException as error:
                try:
                    checked(u.SetThreadDesktop(original))
                    checked(u.CloseDesktop(creator))
                except BaseException as cleanup_error:
                    error.add_note(f"Desktop creation cleanup failed: {cleanup_error}")
                raise
            # Keep our desktop reference until every owned application exits.
            owners[name] = {"desktop": creator, "process": process.process,
                            "pid": process.pid, "exe": exe, "pids": {process.pid}}
            try:
                if k.ResumeThread(process.thread) == 0xFFFFFFFF:
                    raise c.WinError(c.get_last_error())
            finally:
                k.CloseHandle(process.thread)
            exit_code = w.DWORD()
            checked(k.GetExitCodeProcess(process.process, c.byref(exit_code)))
            result["pid"] = process.pid
            result["exitCode"] = exit_code.value
        else:
            assert action in ("inspect", "select", "cancel", "close"), "Unknown native action"
            if action != "inspect":
                assert owner, "Preserve an unowned desktop"
            desktop = u.OpenDesktopW(desktop_name, 0, False, 0xC7)
            result["exists"] = bool(desktop)
            if owner:
                result["windows"] = []
            if desktop and owner:
                checked(u.SetThreadDesktop(desktop))
                errors = []

                @callback_type
                def visit(hwnd, unused):
                    try:
                        pid = owned_window_pid(hwnd, owner)
                        if pid is None:
                            return True
                        title = c.create_unicode_buffer(256)
                        u.GetWindowTextW(hwnd, title, len(title))
                        if request.get("diagnostics") or title.value in ("Rillday", "Choose folder…"):
                            window_class = c.create_unicode_buffer(256)
                            u.GetClassNameW(hwnd, window_class, len(window_class))
                            if window_class.value == "Tauri Window" or (window_class.value == "#32770" and title.value == "Choose folder…"):
                                owner["pids"].add(pid)
                            texts, edits, buttons, views = [], [], [], []

                            @callback_type
                            def child_text(child, unused):
                                text = c.create_unicode_buffer(2048)
                                u.GetWindowTextW(child, text, len(text))
                                if text.value:
                                    texts.append(text.value)
                                control_class = c.create_unicode_buffer(128)
                                u.GetClassNameW(child, control_class, len(control_class))
                                if control_class.value == "SHELLDLL_DefView" and text.value:
                                    views.append(child)
                                if control_class.value == "Edit" and u.GetDlgCtrlID(child) == 1152:
                                    edits.append(child)
                                if control_class.value == "Button" and u.GetDlgCtrlID(child) == 1:
                                    buttons.append(child)
                                return True

                            u.EnumChildWindows(hwnd, child_text, 0)
                            result["windows"].append({"pid": pid, "title": title.value,
                                                      "class": window_class.value, "texts": texts,
                                                      "ready": bool(views and edits and buttons)})
                            if action == "select" and title.value == "Choose folder…":
                                assert len(edits) == 1 and len(buttons) == 1, "Expected the Windows folder selection controls"
                                folder = Path(request["path"]).resolve()
                                assert folder.is_relative_to(root) and folder.is_dir()
                                value = c.create_unicode_buffer(str(folder))
                                # Edit operations notify the shell, unlike replacing the control's caption.
                                send_message(edits[0], 0xB1, 0, -1)
                                send_message(edits[0], 0xC2, 1, c.addressof(value))
                                entered = c.create_unicode_buffer(len(value))
                                send_message(edits[0], 0x0D, len(entered), c.addressof(entered))
                                assert entered.value == str(folder), "Folder picker path edit rejected the requested folder"
                                checked(u.PostMessageW(buttons[0], 0xF5, 0, 0))
                            if action == "close" or action == "cancel" and title.value == "Choose folder…":
                                checked(u.PostMessageW(hwnd, 0x10, 0, 0))
                        return True
                    except BaseException as error:
                        # ctypes callbacks cannot propagate Python exceptions to their caller.
                        errors.append(error)
                        return False

                c.set_last_error(0)
                enumerated = u.EnumDesktopWindows(desktop, visit, 0)
                enumeration_error = c.get_last_error()
                if errors:
                    raise errors[0]
                # Empty desktops can return FALSE without setting an error.
                if not enumerated and enumeration_error:
                    raise c.WinError(enumeration_error)
    except BaseException as error:
        failure = error
        raise
    finally:
        try:
            try:
                checked(u.SetThreadDesktop(original))
            finally:
                if desktop:
                    checked(u.CloseDesktop(desktop))
            result["inputAfter"] = input_desktop()
            assert before == result["inputAfter"]
        except BaseException as error:
            if failure is None:
                raise
            failure.add_note(f"Native request cleanup failed: {error}")
    return result


def cleanup():
    errors = []
    for name, owner in list(owners.items()):
        try:
            enumeration_errors = []

            @callback_type
            def visit(hwnd, unused):
                try:
                    pid = owned_window_pid(hwnd, owner)
                    if pid is not None:
                        owner["pids"].add(pid)
                    return True
                except BaseException as error:
                    enumeration_errors.append(error)
                    return False

            if owner["desktop"]:
                c.set_last_error(0)
                enumerated = u.EnumDesktopWindows(owner["desktop"], visit, 0)
                enumeration_error = c.get_last_error()
                if enumeration_errors:
                    raise enumeration_errors[0]
                if not enumerated and enumeration_error:
                    raise c.WinError(enumeration_error)
        except BaseException as error:
            errors.append(error)
        finally:
            try:
                release(name)
            except BaseException as error:
                errors.append(error)
    if errors:
        raise BaseExceptionGroup("Native driver cleanup failed", errors)


try:
    for line in sys.stdin:
        try:
            response = {"result": handle(json.loads(line))}
        except BaseException:
            response = {"error": traceback.format_exc()}
        print(json.dumps(response), flush=True)
finally:
    cleanup()
