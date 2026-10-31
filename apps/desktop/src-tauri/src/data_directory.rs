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
    ApplicationProfile,
}

pub struct DataDirectory {
    pub path: PathBuf,
    default: PathBuf,
    location_file: PathBuf,
    configured: bool,
}

impl DataDirectory {
    pub fn load(identifier: &str) -> io::Result<Self> {
        let configuration = dirs::config_dir()
            .ok_or_else(|| io::Error::other("Missing configuration directory"))?
            .join(identifier);
        let default = dirs::data_local_dir()
            .ok_or_else(|| io::Error::other("Missing local data directory"))?
            .join(identifier);
        Self::load_from(configuration, default)
    }

    fn load_from(configuration: PathBuf, default: PathBuf) -> io::Result<Self> {
        let location_file = configuration.join(LOCATION);
        let (path, configured) = match fs::read_to_string(&location_file) {
            Ok(value) => {
                let value = value
                    .strip_suffix("\r\n")
                    .or_else(|| value.strip_suffix('\n'))
                    .unwrap_or(&value);
                let path = PathBuf::from(value);
                if !path.is_absolute() {
                    return Err(io::Error::other(
                        "The data directory must be an absolute path",
                    ));
                }
                (validate(&path, Initialization::Reject)?, true)
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => (default.clone(), false),
            Err(error) => return Err(error),
        };
        Ok(Self {
            path,
            default,
            location_file,
            configured,
        })
    }

    pub fn needs_setup(&self) -> bool {
        !self.configured
    }

    pub fn select(&self, path: &Path) -> io::Result<()> {
        let is_default = path == self.default
            || match (
                dunce::canonicalize(path),
                dunce::canonicalize(&self.default),
            ) {
                (Ok(selected), Ok(default)) => selected == default,
                _ => false,
            };
        let path = if is_default {
            fs::create_dir_all(&self.default)?;
            validate(&self.default, Initialization::ApplicationProfile)?
        } else {
            validate(path, Initialization::EmptyFolder)?
        };
        let value = path
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
    tempfile::NamedTempFile::new_in(&path)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let configuration = root.path().join("configuration");
        let data = root.path().join("profile");
        (root, configuration, data)
    }

    #[test]
    fn first_launch_does_not_initialize_or_choose_a_workspace() {
        let (_root, configuration, data) = fixture();
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        assert!(directory.needs_setup());
        assert_eq!(directory.path, data);
        assert!(!configuration.exists());
        assert!(!data.exists());
    }

    #[test]
    fn confirming_the_default_is_durable_and_skips_setup_on_restart() {
        let (_root, configuration, data) = fixture();
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        directory.select(&directory.path).unwrap();
        let reopened = DataDirectory::load_from(configuration, data.clone()).unwrap();
        assert!(!reopened.needs_setup());
        assert_eq!(reopened.path, dunce::canonicalize(data).unwrap());
    }

    #[test]
    fn confirming_an_existing_default_preserves_its_contents() {
        let (_root, configuration, data) = fixture();
        fs::create_dir(&data).unwrap();
        fs::write(data.join("saved-work"), "keep").unwrap();
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        assert!(directory.needs_setup());
        assert!(!data.join(MARKER).exists());
        directory.select(&directory.path).unwrap();
        let reopened = DataDirectory::load_from(configuration, data.clone()).unwrap();
        assert_eq!(
            fs::read_to_string(reopened.path.join("saved-work")).unwrap(),
            "keep"
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_windows_default_folder_alias_preserves_existing_work() {
        let (root, configuration, _) = fixture();
        let data = root.path().join("ExistingProfile");
        fs::create_dir(&data).unwrap();
        fs::write(data.join("saved-work"), "keep").unwrap();
        let alias = PathBuf::from(data.to_string_lossy().to_ascii_lowercase());
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        directory.select(&alias).unwrap();
        let reopened = DataDirectory::load_from(configuration, data).unwrap();
        assert_eq!(
            fs::read_to_string(reopened.path.join("saved-work")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn opening_an_existing_workspace_preserves_both_folders() {
        let (root, configuration, data) = fixture();
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        directory.select(&directory.path).unwrap();
        fs::write(data.join("saved-work"), "original").unwrap();
        let other = root.path().join("other");
        fs::create_dir(&other).unwrap();
        fs::write(other.join(MARKER), SIGNATURE).unwrap();
        fs::write(other.join("saved-work"), "other").unwrap();
        directory.select(&other).unwrap();
        let reopened = DataDirectory::load_from(configuration, data.clone()).unwrap();
        assert_eq!(
            fs::read_to_string(reopened.path.join("saved-work")).unwrap(),
            "other"
        );
        assert_eq!(
            fs::read_to_string(data.join("saved-work")).unwrap(),
            "original"
        );
    }

    #[test]
    fn missing_or_invalid_selection_never_opens_a_replacement() {
        for setting in ["", "relative", "missing"] {
            let (_root, configuration, data) = fixture();
            fs::create_dir(&configuration).unwrap();
            let value = if setting == "missing" {
                data.to_string_lossy().into_owned()
            } else {
                setting.to_owned()
            };
            fs::write(configuration.join(LOCATION), value).unwrap();
            assert!(DataDirectory::load_from(configuration, data.clone()).is_err());
            assert!(!data.exists());
        }
    }

    #[test]
    fn filename_whitespace_round_trips_with_lf_and_crlf() {
        for ending in ["\n", "\r\n"] {
            let (root, configuration, data) = fixture();
            let selected = root.path().join(" selected");
            let sibling = root.path().join("selected");
            fs::create_dir(&selected).unwrap();
            fs::create_dir(&sibling).unwrap();
            fs::write(sibling.join(MARKER), SIGNATURE).unwrap();
            let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
            directory.select(&selected).unwrap();
            let canonical = dunce::canonicalize(selected).unwrap();
            fs::write(
                &directory.location_file,
                format!("{}{ending}", canonical.display()),
            )
            .unwrap();
            let reopened = DataDirectory::load_from(configuration, data).unwrap();
            assert_eq!(reopened.path, canonical);
        }
    }

    #[test]
    fn rejected_folder_keeps_the_previous_selection() {
        let (root, configuration, data) = fixture();
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        directory.select(&directory.path).unwrap();
        let unrelated = root.path().join("unrelated");
        fs::create_dir(&unrelated).unwrap();
        fs::write(unrelated.join("private-file"), "keep").unwrap();
        assert!(directory.select(&unrelated).is_err());
        let reopened = DataDirectory::load_from(configuration, data.clone()).unwrap();
        assert_eq!(reopened.path, dunce::canonicalize(data).unwrap());
        assert!(!unrelated.join(MARKER).exists());
        assert_eq!(
            fs::read_to_string(unrelated.join("private-file")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn configured_empty_folder_is_not_silently_initialized() {
        let (_root, configuration, data) = fixture();
        fs::create_dir(&configuration).unwrap();
        fs::create_dir(&data).unwrap();
        fs::write(configuration.join(LOCATION), data.to_str().unwrap()).unwrap();
        assert!(DataDirectory::load_from(configuration, data.clone()).is_err());
        assert!(!data.join(MARKER).exists());
    }

    #[test]
    fn identity_accepts_windows_line_endings_but_not_foreign_content() {
        let (_root, configuration, data) = fixture();
        let directory = DataDirectory::load_from(configuration.clone(), data.clone()).unwrap();
        directory.select(&directory.path).unwrap();
        fs::write(data.join(MARKER), "Rillday data directory\r\n").unwrap();
        assert!(DataDirectory::load_from(configuration.clone(), data.clone()).is_ok());
        fs::write(data.join(MARKER), "Unrelated application").unwrap();
        assert!(DataDirectory::load_from(configuration, data).is_err());
    }
}
