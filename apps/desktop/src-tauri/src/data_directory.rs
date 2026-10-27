use std::{
    fs, io,
    path::{Path, PathBuf},
};

const LOCATION: &str = "rillday-data-directory";
const MARKER: &str = ".rillday-data";
const SIGNATURE: &str = "Rillday data directory\n";

enum Initialization {
    Reject,
    EmptyFolder,
    InstalledProfile,
}

pub struct DataDirectory {
    pub path: PathBuf,
    executable_directory: PathBuf,
    location_file: PathBuf,
}

impl DataDirectory {
    pub fn load(executable: &Path, identifier: &str) -> io::Result<Self> {
        let executable_directory = executable
            .parent()
            .ok_or_else(|| io::Error::other("Missing executable directory"))?
            .to_path_buf();
        let configuration = dirs::config_dir()
            .ok_or_else(|| io::Error::other("Missing configuration directory"))?
            .join(identifier);
        let default = dirs::data_local_dir()
            .ok_or_else(|| io::Error::other("Missing local data directory"))?
            .join(identifier);
        Self::load_from(executable_directory, configuration, default)
    }

    fn load_from(
        executable_directory: PathBuf,
        configuration: PathBuf,
        default: PathBuf,
    ) -> io::Result<Self> {
        let executable_directory = dunce::canonicalize(executable_directory)?;
        let sidecar = executable_directory.join(LOCATION);
        let location_file = if sidecar.try_exists()? {
            sidecar
        } else {
            configuration.join(LOCATION)
        };
        let path = match fs::read_to_string(&location_file) {
            Ok(value) => {
                let value = value
                    .strip_suffix("\r\n")
                    .or_else(|| value.strip_suffix('\n'))
                    .unwrap_or(&value);
                if value.is_empty() {
                    return Err(io::Error::other("The data directory setting is empty"));
                }
                let path = PathBuf::from(value);
                let path = if path.is_absolute() {
                    path
                } else {
                    executable_directory.join(path)
                };
                validate(&path, Initialization::Reject)?
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir_all(&default)?;
                // The default location may already contain an installed user's WebView data.
                validate(&default, Initialization::InstalledProfile)?
            }
            Err(error) => return Err(error),
        };
        Ok(Self {
            path,
            executable_directory,
            location_file,
        })
    }

    pub fn select(&self, path: &Path) -> io::Result<()> {
        let path = validate(path, Initialization::EmptyFolder)?;
        let value = path
            .strip_prefix(&self.executable_directory)
            .unwrap_or(&path);
        let value = value
            .to_str()
            .ok_or_else(|| io::Error::other("The folder path is not valid Unicode"))?;
        let parent = self
            .location_file
            .parent()
            .ok_or_else(|| io::Error::other("Missing configuration directory"))?;
        fs::create_dir_all(parent)?;
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        use io::Write;
        writeln!(file, "{value}")?;
        file.as_file().sync_all()?;
        file.persist(&self.location_file)
            .map_err(|error| error.error)?;
        Ok(())
    }
}

fn validate(path: &Path, initialization: Initialization) -> io::Result<PathBuf> {
    let path = dunce::canonicalize(path)?;
    if !path.is_dir() || path.parent().is_none() {
        return Err(io::Error::other("Choose a dedicated Rillday folder"));
    }
    let marker = path.join(MARKER);
    if marker.try_exists()? {
        if fs::read_to_string(&marker)?.trim() != SIGNATURE.trim() {
            return Err(io::Error::other("This is not a Rillday data folder"));
        }
    } else {
        if matches!(initialization, Initialization::Reject) {
            return Err(io::Error::other(
                "The configured data folder is missing its identity file",
            ));
        }
        if matches!(initialization, Initialization::EmptyFolder)
            && fs::read_dir(&path)?.next().is_some()
        {
            return Err(io::Error::other(
                "Choose an empty folder or an existing Rillday data folder",
            ));
        }
        use io::Write;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(marker)?;
        file.write_all(SIGNATURE.as_bytes())?;
        file.sync_all()?;
    }
    // Verify access before committing the selection; never fall back to a different workspace.
    tempfile::NamedTempFile::new_in(&path)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("app");
        let configuration = root.path().join("configuration");
        let data = root.path().join("installed-data");
        fs::create_dir(&executable).unwrap();
        (root, executable, configuration, data)
    }

    #[test]
    fn installed_data_is_preserved_and_selection_is_durable() {
        let (root, executable, configuration, data) = fixture();
        fs::create_dir(&data).unwrap();
        fs::write(data.join("existing-data"), "saved work").unwrap();
        let directory =
            DataDirectory::load_from(executable.clone(), configuration.clone(), data.clone())
                .unwrap();
        let selected = root.path().join("selected");
        fs::create_dir(&selected).unwrap();
        directory.select(&selected).unwrap();
        let reopened = DataDirectory::load_from(executable, configuration, data.clone()).unwrap();
        assert_eq!(reopened.path, dunce::canonicalize(selected).unwrap());
        assert_eq!(
            fs::read_to_string(data.join("existing-data")).unwrap(),
            "saved work"
        );
    }

    #[test]
    fn portable_location_remains_relative_after_the_whole_folder_moves() {
        let (root, executable, configuration, data) = fixture();
        let portable_data = executable.join("data");
        fs::create_dir(&portable_data).unwrap();
        fs::write(portable_data.join(MARKER), SIGNATURE).unwrap();
        fs::write(executable.join(LOCATION), "data\n").unwrap();
        let directory =
            DataDirectory::load_from(executable.clone(), configuration.clone(), data.clone())
                .unwrap();
        fs::write(directory.path.join("saved-work"), "offline").unwrap();
        directory.select(&portable_data).unwrap();
        assert_eq!(
            fs::read_to_string(executable.join(LOCATION)).unwrap(),
            "data\n"
        );
        let moved = root.path().join("moved-app");
        fs::rename(executable, &moved).unwrap();
        let reopened =
            DataDirectory::load_from(moved.clone(), configuration, data.clone()).unwrap();
        assert_eq!(
            reopened.path,
            dunce::canonicalize(moved.join("data")).unwrap()
        );
        assert_eq!(
            fs::read_to_string(reopened.path.join("saved-work")).unwrap(),
            "offline"
        );
        assert!(!data.exists());
    }

    #[cfg(windows)]
    #[test]
    fn windows_executable_alias_keeps_portable_selection_relative() {
        let (root, executable, configuration, data) = fixture();
        let portable = executable.join("data");
        fs::create_dir(&portable).unwrap();
        fs::write(portable.join(MARKER), SIGNATURE).unwrap();
        fs::write(executable.join(LOCATION), "data\n").unwrap();
        let alias = PathBuf::from(executable.to_string_lossy().to_ascii_lowercase());
        let directory =
            DataDirectory::load_from(alias, configuration.clone(), data.clone()).unwrap();
        directory.select(&portable).unwrap();
        assert_eq!(
            fs::read_to_string(executable.join(LOCATION)).unwrap(),
            "data\n"
        );
        let moved = root.path().join("moved-app");
        fs::rename(executable, &moved).unwrap();
        let reopened = DataDirectory::load_from(moved.clone(), configuration, data).unwrap();
        assert_eq!(
            reopened.path,
            dunce::canonicalize(moved.join("data")).unwrap()
        );
    }

    #[test]
    fn missing_or_invalid_selection_does_not_create_an_empty_replacement() {
        for setting in ["missing", "", "unrelated"] {
            let (_root, executable, configuration, data) = fixture();
            fs::create_dir(executable.join("unrelated")).unwrap();
            fs::write(executable.join("unrelated/personal-file"), "keep").unwrap();
            fs::write(executable.join(LOCATION), setting).unwrap();
            assert!(DataDirectory::load_from(executable, configuration, data.clone()).is_err());
            assert!(!data.exists());
        }
    }

    #[test]
    fn selected_folder_name_whitespace_round_trips_after_restart() {
        for ending in ["\n", "\r\n"] {
            let (_root, executable, configuration, data) = fixture();
            let selected = executable.join(" selected");
            fs::create_dir(&selected).unwrap();
            let directory =
                DataDirectory::load_from(executable.clone(), configuration.clone(), data.clone())
                    .unwrap();
            directory.select(&selected).unwrap();
            assert_eq!(
                fs::read_to_string(&directory.location_file).unwrap(),
                " selected\n"
            );
            fs::write(&directory.location_file, format!(" selected{ending}")).unwrap();
            let reopened = DataDirectory::load_from(executable, configuration, data).unwrap();
            assert_eq!(reopened.path, dunce::canonicalize(selected).unwrap());
        }
    }

    #[test]
    fn selected_folder_name_whitespace_does_not_open_trimmed_sibling() {
        for ending in ["\n", "\r\n"] {
            let (_root, executable, configuration, data) = fixture();
            let selected = executable.join(" selected");
            let sibling = executable.join("selected");
            fs::create_dir(&selected).unwrap();
            fs::create_dir(&sibling).unwrap();
            fs::write(sibling.join(MARKER), SIGNATURE).unwrap();
            let directory =
                DataDirectory::load_from(executable.clone(), configuration.clone(), data.clone())
                    .unwrap();
            directory.select(&selected).unwrap();
            fs::write(&directory.location_file, format!(" selected{ending}")).unwrap();
            let reopened = DataDirectory::load_from(executable, configuration, data).unwrap();
            assert_eq!(reopened.path, dunce::canonicalize(selected).unwrap());
        }
    }

    #[test]
    fn rejected_folder_keeps_the_previous_selection() {
        let (root, executable, configuration, data) = fixture();
        let directory =
            DataDirectory::load_from(executable.clone(), configuration.clone(), data.clone())
                .unwrap();
        let unrelated = root.path().join("unrelated");
        fs::create_dir(&unrelated).unwrap();
        fs::write(unrelated.join("private-file"), "keep").unwrap();
        assert!(directory.select(&unrelated).is_err());
        let reopened = DataDirectory::load_from(executable, configuration, data.clone()).unwrap();
        assert_eq!(reopened.path, dunce::canonicalize(data).unwrap());
        assert_eq!(
            fs::read_to_string(unrelated.join("private-file")).unwrap(),
            "keep"
        );
        assert!(!unrelated.join(MARKER).exists());
    }

    #[test]
    fn configured_empty_folder_is_not_silently_initialized() {
        let (_root, executable, configuration, data) = fixture();
        let empty = executable.join("data");
        fs::create_dir(&empty).unwrap();
        fs::write(executable.join(LOCATION), "data\n").unwrap();
        assert!(DataDirectory::load_from(executable, configuration, data.clone()).is_err());
        assert!(!empty.join(MARKER).exists());
        assert!(!data.exists());
    }

    #[test]
    fn identity_accepts_windows_line_endings_but_not_foreign_content() {
        let (_root, executable, configuration, data) = fixture();
        let portable = executable.join("data");
        fs::create_dir(&portable).unwrap();
        fs::write(executable.join(LOCATION), "data\r\n").unwrap();
        fs::write(portable.join(MARKER), "Rillday data directory\r\n").unwrap();
        assert!(
            DataDirectory::load_from(executable.clone(), configuration.clone(), data.clone())
                .is_ok()
        );
        fs::write(portable.join(MARKER), "Unrelated application").unwrap();
        assert!(DataDirectory::load_from(executable, configuration, data.clone()).is_err());
        assert!(!data.exists());
    }
}
