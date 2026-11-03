use crate::model::{err, Result};
use std::{
    ffi::c_void,
    path::Path,
    ptr::{null, null_mut},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree, HANDLE},
    Security::{Authorization::*, Cryptography::*, *},
    Storage::FileSystem::*,
    System::{JobObjects::*, Registry::*, Threading::*},
};

pub const NO_WINDOW: u32 = CREATE_NO_WINDOW;
// Tauri canonicalizes Windows resources to \\?\ paths. Node's ESM entry-point
// loader does not accept that spelling, although CreateProcess can launch it.
pub fn external_path(path: &Path) -> std::path::PathBuf {
    dunce::simplified(path).to_path_buf()
}
fn wide(value: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.as_ref().encode_wide().chain(Some(0)).collect()
}

pub fn protect(data: &[u8]) -> Result<Vec<u8>> {
    crypt(data, true)
}
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
    crypt(data, false)
}
fn crypt(data: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    if data.len() > 20_000_000 {
        return err("凭据格式无效。");
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output: CRYPT_INTEGER_BLOB = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                null(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return err("本机凭据无法解密。更换电脑后请重新填写凭据。");
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut c_void);
    }
    Ok(bytes)
}

pub fn secure_directory(path: &Path) -> Result<()> {
    const ERROR: &str = "无法设置本机数据的访问权限，请使用 NTFS 上当前用户可写入的安装目录。";
    if path.parent().is_none() || !path.is_dir() {
        return err(ERROR);
    }
    unsafe {
        let mut token: HANDLE = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return err(ERROR);
        }
        let mut size = 0;
        GetTokenInformation(token, TokenUser, null_mut(), 0, &mut size);
        let mut buffer = vec![0usize; (size as usize).div_ceil(std::mem::size_of::<usize>())];
        let success = GetTokenInformation(
            token,
            TokenUser,
            buffer.as_mut_ptr() as *mut c_void,
            size,
            &mut size,
        );
        CloseHandle(token);
        if success == 0 {
            return err(ERROR);
        }
        let user = &*(buffer.as_ptr() as *const TOKEN_USER);
        let mut sid = null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut sid) == 0 {
            return err(ERROR);
        }
        let mut len = 0;
        while *sid.add(len) != 0 {
            len += 1;
        }
        let sid_text = String::from_utf16_lossy(std::slice::from_raw_parts(sid, len));
        LocalFree(sid as *mut c_void);
        let sddl = wide(format!(
            "D:P(A;OICI;FA;;;{})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)",
            sid_text
        ));
        let mut descriptor = null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            null_mut(),
        ) == 0
        {
            return err(ERROR);
        }
        let mut present = 0;
        let mut defaulted = 0;
        let mut dacl = null_mut();
        let got = GetSecurityDescriptorDacl(descriptor, &mut present, &mut dacl, &mut defaulted);
        let code = if got != 0 && present != 0 {
            SetNamedSecurityInfoW(
                wide(path).as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                dacl,
                null(),
            )
        } else {
            1
        };
        LocalFree(descriptor);
        if code != 0 {
            return err(ERROR);
        }
    }
    Ok(())
}

pub fn replace_file(source: &Path, target: &Path) -> Result<()> {
    if unsafe {
        MoveFileExW(
            wide(source).as_ptr(),
            wide(target).as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return err("无法写入本机数据。");
    }
    Ok(())
}

pub struct ProcessJob(HANDLE);
// Owned process/job handles are transferable; the handle is closed exactly once.
unsafe impl Send for ProcessJob {}
unsafe impl Sync for ProcessJob {}
impl ProcessJob {
    pub fn attach(pid: u32) -> Result<Self> {
        unsafe {
            let job = CreateJobObjectW(null(), null());
            if job.is_null() {
                return err("无法安全启动后台进程。");
            }
            let owned = Self(job);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const c_void,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
            {
                return err("无法安全启动后台进程。");
            }
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                return err("无法安全启动后台进程。");
            }
            let ok = AssignProcessToJobObject(job, process);
            CloseHandle(process);
            if ok == 0 {
                return err("无法安全启动后台进程。");
            }
            Ok(owned)
        }
    }
}
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        os::windows::process::CommandExt,
        process::{Command, Stdio},
    };
    #[test]
    fn canonical_windows_resource_paths_can_launch_node_modules() {
        let directory=std::env::temp_dir().join(format!("yachiyo-node-path-{}",uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();let file=directory.join("probe.mjs");
        std::fs::write(&file,"console.log('ready')").unwrap();
        let canonical=file.canonicalize().unwrap();
        let node=Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("tools/win32-x64/node.exe");
        let output=Command::new(external_path(&node.canonicalize().unwrap())).arg(external_path(&canonical)).creation_flags(NO_WINDOW).output().unwrap();
        assert!(output.status.success());assert_eq!(String::from_utf8_lossy(&output.stdout).trim(),"ready");
        assert!(directory.file_name().unwrap().to_string_lossy().starts_with("yachiyo-node-path-"));std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn closing_job_terminates_owned_worker_and_descendants() {
        let node = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("tools/win32-x64/node.exe");
        let mut worker=Command::new(node).args(["-e","process.stdin.once('data',()=>{const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(c.pid)});setInterval(()=>{},1000)"])
            .creation_flags(NO_WINDOW).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap();
        let job = ProcessJob::attach(worker.id()).unwrap();
        worker.stdin.take().unwrap().write_all(b"start\n").unwrap();
        let mut line = String::new();
        BufReader::new(worker.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let descendant: u32 = line.trim().parse().unwrap();
        let handle = unsafe { OpenProcess(0x00100000, 0, descendant) };
        assert!(!handle.is_null());
        drop(job);
        let result = unsafe { WaitForSingleObject(handle, 5000) };
        unsafe { CloseHandle(handle) };
        assert_eq!(
            result, 0,
            "owned descendant must exit when the manager releases its job"
        );
        // KILL_ON_JOB_CLOSE may use exit code 0; liveness is what matters.
        let _ = worker.wait().unwrap();
    }
}

pub fn login_startup(enabled: bool, executable: &Path) -> Result<()> {
    unsafe {
        let mut key = null_mut();
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run").as_ptr(),
            0,
            null(),
            0,
            KEY_SET_VALUE,
            null(),
            &mut key,
            null_mut(),
        ) != 0
        {
            return err("无法更新 Windows 登录启动项。");
        }
        let name = wide("io.yachiyo.desktop");
        let result = if enabled {
            let command = wide(format!("\"{}\" --background", executable.display()));
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                command.as_ptr() as *const u8,
                (command.len() * 2) as u32,
            )
        } else {
            let code = RegDeleteValueW(key, name.as_ptr());
            if code == 2 {
                0
            } else {
                code
            }
        };
        if result == 0 {
            RegDeleteValueW(key, wide("electron.app.Yachiyo").as_ptr());
        }
        RegCloseKey(key);
        if result != 0 {
            return err("无法更新 Windows 登录启动项。");
        }
    }
    Ok(())
}
