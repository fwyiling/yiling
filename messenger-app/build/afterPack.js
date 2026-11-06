// Sets the exe icon and version info without Wine, so Windows builds work from Linux/macOS.
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { productFilename } = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const version = context.packager.appInfo.version;

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, groupId, lang, iconFile.icons.map((i) => i.data)
  );

  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (vi) {
    const [major, minor, patch] = version.split('.').map(Number);
    vi.setFileVersion(major, minor, patch, 0, 1033);
    vi.setProductVersion(major, minor, patch, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'Messenger',
      CompanyName: 'Messenger Desktop',
      LegalCopyright: '',
      ProductName: 'Messenger',
      OriginalFilename: `${productFilename}.exe`,
      InternalName: productFilename,
    });
    vi.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
};
