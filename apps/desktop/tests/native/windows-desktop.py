"""Run test-owned windows on a separate desktop without switching user input."""

import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

u = c.WinDLL("user32", use_last_error=True)
k = c.WinDLL("kernel32", use_last_error=True)
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
u.OpenInputDesktop.argtypes = [w.DWORD, w.BOOL, w.DWORD]
u.OpenInputDesktop.restype = w.HANDLE
u.GetUserObjectInformationW.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.POINTER(w.DWORD)]
u.EnumDesktopWindows.argtypes = [w.HANDLE, callback_type, w.LPARAM]
u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
u.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.EnumChildWindows.argtypes = [w.HWND, callback_type, w.LPARAM]
u.GetDlgCtrlID.argtypes = [w.HWND]
u.GetDlgCtrlID.restype = c.c_int
u.SendMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
u.SendMessageW.restype = w.LPARAM
u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
k.CloseHandle.argtypes = [w.HANDLE]
u.WaitForInputIdle.argtypes = [w.HANDLE, w.DWORD]
u.WaitForInputIdle.restype = w.DWORD
k.GetExitCodeProcess.argtypes = [w.HANDLE, c.POINTER(w.DWORD)]
k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
k.OpenProcess.restype = w.HANDLE
k.QueryFullProcessImageNameW.argtypes = [w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD)]
k.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]


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


def input_desktop():
    handle = checked(u.OpenInputDesktop(0, False, 1))
    try:
        name = c.create_unicode_buffer(256)
        size = w.DWORD()
        checked(u.GetUserObjectInformationW(handle, 2, name, c.sizeof(name), c.byref(size)))
        return name.value
    finally:
        checked(u.CloseDesktop(handle))


def terminate_owned(pid, executable):
    handle = k.OpenProcess(0x1000 | 0x100000, False, pid)
    if not handle and c.get_last_error() == 87:
        return
    checked(handle)
    try:
        exit_code = w.DWORD()
        checked(k.GetExitCodeProcess(handle, c.byref(exit_code)))
        if exit_code.value != 259:
            return
        image = c.create_unicode_buffer(32768)
        size = w.DWORD(len(image))
        checked(k.QueryFullProcessImageNameW(handle, 0, image, c.byref(size)))
        assert Path(image.value).resolve() == executable, "Preserve an unrelated process"
        # Retain the process handle while terminating its tree to prevent PID reuse.
        subprocess.run(["taskkill.exe", "/PID", str(pid), "/T", "/F"],
                       capture_output=True, timeout=10, creationflags=0x08000000)
        if k.WaitForSingleObject(handle, 10000) != 0:
            raise RuntimeError("Owned application did not exit")
    finally:
        k.CloseHandle(handle)


request = json.load(sys.stdin)
name = request["desktop"]
assert name.startswith("RilldayTest-")
uuid.UUID(name.removeprefix("RilldayTest-"))
before = input_desktop()
assert name != before
original = u.GetThreadDesktop(k.GetCurrentThreadId())
desktop = None
result = {"inputBefore": before, "desktop": name}
try:
    if request["action"] == "terminate":
        exe = Path(request["exe"]).resolve()
        root = Path(__file__).resolve().parents[2] / ".cache" / "tests" / "native"
        assert exe.is_relative_to(root.resolve()) and exe.name == "rillday-desktop.exe"
        terminate_owned(request["pid"], exe)
    elif request["action"] == "start":
        existing = u.OpenDesktopW(name, 0, False, 0xC7)
        if existing:
            u.CloseDesktop(existing)
            raise RuntimeError("Preserve an existing desktop")
        desktop = checked(u.CreateDesktopW(name, None, None, 0, 0xC7, None))
        root = Path(__file__).resolve().parents[2] / ".cache" / "tests" / "native"
        exe = Path(request["exe"]).resolve()
        assert exe.is_relative_to(root.resolve()) and exe.name == "rillday-desktop.exe"
        env = dict(os.environ)
        env.update(request["env"])
        block = c.create_unicode_buffer("\0".join(f"{key}={value}" for key, value in sorted(env.items(), key=lambda pair: pair[0].upper())) + "\0\0")
        startup = Startup()
        startup.cb = c.sizeof(startup)
        startup.desktop = "WinSta0\\" + name
        startup.flags = 1
        startup.show = 4
        process = Process()
        checked(k.CreateProcessW(str(exe), None, None, None, False, 0x400, block,
                                str(exe.parent), c.byref(startup), c.byref(process)))
        result["pid"] = process.pid
        try:
            # Keep the desktop alive until the new GUI thread has attached to it.
            result["inputIdle"] = u.WaitForInputIdle(process.process, 10000)
            exit_code = w.DWORD()
            checked(k.GetExitCodeProcess(process.process, c.byref(exit_code)))
            if exit_code.value != 259:
                raise RuntimeError(f"Application exited during startup: {exit_code.value:#x}")
        except BaseException:
            terminate_owned(process.pid, exe)
            raise
        finally:
            k.CloseHandle(process.thread)
            k.CloseHandle(process.process)
    else:
        desktop = u.OpenDesktopW(name, 0, False, 0xC7)
        result["exists"] = bool(desktop)
        result["windows"] = []
        if desktop:
            checked(u.SetThreadDesktop(desktop))

            @callback_type
            def visit(hwnd, unused):
                title = c.create_unicode_buffer(256)
                u.GetWindowTextW(hwnd, title, len(title))
                if title.value in ("Rillday", "Choose folder…"):
                    pid = w.DWORD()
                    u.GetWindowThreadProcessId(hwnd, c.byref(pid))
                    window_class = c.create_unicode_buffer(256)
                    u.GetClassNameW(hwnd, window_class, len(window_class))
                    texts = []
                    edits = []
                    buttons = []

                    @callback_type
                    def child_text(child, unused):
                        text = c.create_unicode_buffer(2048)
                        u.GetWindowTextW(child, text, len(text))
                        if text.value:
                            texts.append(text.value)
                        control_class = c.create_unicode_buffer(128)
                        u.GetClassNameW(child, control_class, len(control_class))
                        if control_class.value == "Edit" and u.GetDlgCtrlID(child) == 1152:
                            edits.append(child)
                        if control_class.value == "Button" and u.GetDlgCtrlID(child) == 1:
                            buttons.append(child)
                        return True

                    u.EnumChildWindows(hwnd, child_text, 0)
                    result["windows"].append({"pid": pid.value, "class": window_class.value, "texts": texts})
                    if request["action"] == "select" and title.value == "Choose folder…":
                        assert len(edits) == 1 and len(buttons) == 1, "Expected the Windows folder selection controls"
                        folder = Path(request["path"]).resolve()
                        root = Path(__file__).resolve().parents[2] / ".cache" / "tests" / "native"
                        assert folder.is_relative_to(root.resolve()) and folder.is_dir()
                        value = c.create_unicode_buffer(str(folder))
                        checked(u.SendMessageW(edits[0], 0x0C, 0, c.addressof(value)))
                        u.SendMessageW(buttons[0], 0xF5, 0, 0)
                    if request["action"] == "close":
                        checked(u.PostMessageW(hwnd, 0x10, 0, 0))
                return True

            checked(u.EnumDesktopWindows(desktop, visit, 0))
finally:
    if desktop:
        checked(u.SetThreadDesktop(original))
        checked(u.CloseDesktop(desktop))
result["inputAfter"] = input_desktop()
assert result["inputBefore"] == result["inputAfter"]
print(json.dumps(result))
