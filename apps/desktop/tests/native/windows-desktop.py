"""Control only fixture-owned windows, isolating local runs from user input."""

import ctypes as c
from ctypes import wintypes as w
import json
import msvcrt
import os
from pathlib import Path
import sys
import time
import traceback
import uuid

CREATE_SUSPENDED = 0x4
JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000

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
k.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
k.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
k.CreateJobObjectW.restype = w.HANDLE
k.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
k.QueryInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.c_void_p]
k.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
k.IsProcessInJob.argtypes = [w.HANDLE, w.HANDLE, c.POINTER(w.BOOL)]
k.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]


class BasicLimits(c.Structure):
    _fields_ = [("process_time", c.c_int64), ("job_time", c.c_int64),
                ("flags", w.DWORD), ("minimum_working_set", c.c_size_t),
                ("maximum_working_set", c.c_size_t), ("active_limit", w.DWORD),
                ("affinity", c.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]


class ExtendedLimits(c.Structure):
    _fields_ = [("basic", BasicLimits), ("io", c.c_uint64 * 6),
                ("process_memory", c.c_size_t), ("job_memory", c.c_size_t),
                ("peak_process_memory", c.c_size_t), ("peak_job_memory", c.c_size_t)]


class JobAccounting(c.Structure):
    _fields_ = [("times", c.c_int64 * 4), ("page_faults", w.DWORD),
                ("total_processes", w.DWORD), ("active_processes", w.DWORD),
                ("terminated_processes", w.DWORD)]


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


def create_job():
    job = checked(k.CreateJobObjectW(None, None))
    limits = ExtendedLimits()
    limits.basic.flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    try:
        checked(k.SetInformationJobObject(job, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, c.byref(limits), c.sizeof(limits)))
        return job
    except BaseException:
        k.CloseHandle(job)
        raise


def wait_job(job, seconds):
    deadline = time.monotonic() + seconds
    while True:
        accounting = JobAccounting()
        checked(k.QueryInformationJobObject(job, JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION, c.byref(accounting), c.sizeof(accounting), None))
        if accounting.active_processes == 0:
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.05)


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
        return None
    try:
        member = w.BOOL()
        checked(k.IsProcessInJob(process, owner["job"], c.byref(member)))
        if not member.value:
            return None
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
        try:
            # The job owns the entire restart/WebView2 tree, even without a CDP connection.
            if not wait_job(owner["job"], 15):
                checked(k.TerminateJobObject(owner["job"], 1))
                if not wait_job(owner["job"], 5):
                    raise RuntimeError("The owned application job did not exit")
                raise RuntimeError("The owned application job required forced termination")
        finally:
            try:
                checked(k.CloseHandle(owner["job"]))
            finally:
                try:
                    if owner["desktop"]:
                        checked(u.CloseDesktop(owner["desktop"]))
                finally:
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
            accounting = JobAccounting()
            checked(k.QueryInformationJobObject(owner["job"], JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION, c.byref(accounting), c.sizeof(accounting), None))
            result["activeProcesses"] = accounting.active_processes

        if action == "release":
            release(name)
            result["released"] = True
        elif action == "relaunch":
            assert owner, "Preserve an unowned desktop"
            startup = Startup()
            startup.cb = c.sizeof(startup)
            startup.desktop = "WinSta0\\" + desktop_name
            process = Process()
            checked(k.CreateProcessW(str(owner["exe"]), None, None, None, False,
                                     CREATE_SUSPENDED, None, str(owner["exe"].parent),
                                     c.byref(startup), c.byref(process)))
            try:
                checked(k.AssignProcessToJobObject(owner["job"], process.process))
                if k.ResumeThread(process.thread) == 0xFFFFFFFF:
                    raise c.WinError(c.get_last_error())
                if k.WaitForSingleObject(process.process, 15000) != 0:
                    raise RuntimeError("A second launch did not return to the running application")
                exit_code = w.DWORD()
                checked(k.GetExitCodeProcess(process.process, c.byref(exit_code)))
                result["exitCode"] = exit_code.value
            finally:
                try:
                    if k.WaitForSingleObject(process.process, 0) == 258:
                        checked(k.TerminateProcess(process.process, 1))
                        if k.WaitForSingleObject(process.process, 5000) != 0:
                            raise RuntimeError("The second-launch process did not exit")
                finally:
                    k.CloseHandle(process.thread)
                    k.CloseHandle(process.process)
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
            job = None
            try:
                job = create_job()
                # GUI applications otherwise have no stderr for startup failures.
                with (exe.parent / "native-host.log").open("ab", buffering=0) as output, open(os.devnull, "rb") as null:
                    startup.stdin = msvcrt.get_osfhandle(null.fileno())
                    startup.stdout = startup.stderr = msvcrt.get_osfhandle(output.fileno())
                    os.set_handle_inheritable(startup.stdin, True)
                    os.set_handle_inheritable(startup.stdout, True)
                    arguments = (str(exe), None, None, None, True, CREATE_SUSPENDED, None,
                                 str(exe.parent), c.byref(startup), c.byref(process))
                    checked(k.CreateProcessW(*arguments))
                    checked(k.AssignProcessToJobObject(job, process.process))
            except BaseException as error:
                try:
                    if process.process:
                        checked(k.TerminateProcess(process.process, 1))
                        k.WaitForSingleObject(process.process, 5000)
                        k.CloseHandle(process.thread)
                        k.CloseHandle(process.process)
                    if job:
                        checked(k.CloseHandle(job))
                    checked(u.CloseDesktop(creator))
                except BaseException as cleanup_error:
                    error.add_note(f"Desktop creation cleanup failed: {cleanup_error}")
                raise
            # Keep our desktop reference until every owned application exits.
            owners[name] = {"desktop": creator, "process": process.process,
                            "pid": process.pid, "exe": exe, "job": job}
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
    for name in list(owners):
        try:
            handle({"action": "close", "desktop": name})
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
