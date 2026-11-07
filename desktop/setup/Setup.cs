using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ZaleanaiSetup
{
    /**
     * ZALEANAI installer: extracts the single-file launcher, registers uninstall
     * information and creates shortcuts. The launcher itself owns the data
     * directory (D:\ZALEANAI\data) and the --uninstall flow, so this setup does
     * not need to copy a separate uninstaller.
     */
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (HasArg(args, "/S") || HasArg(args, "--silent"))
            {
                try
                {
                    Installer.Install(Installer.DefaultInstallDir(), true, false, true);
                    Environment.Exit(0);
                }
                catch (Exception error)
                {
                    Installer.Log("静默安装失败：" + error.Message);
                    Environment.Exit(1);
                }
                return;
            }

            Application.Run(new InstallForm());
        }

        private static bool HasArg(string[] args, string flag)
        {
            if (args == null) return false;
            foreach (string item in args)
            {
                if (string.Equals(item, flag, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }
    }

    internal static class Installer
    {
        public const string AppName = "ZALEANAI";
        public const string ExeName = "ZALEANAI.exe";
        public const string DataDir = @"D:\ZALEANAI\data";
        public const string UninstallKey =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ZALEANAI";

        private static byte[] payload;
        private static long payloadBytes;

        /**
         * Default install location: D:\ZALEANAI\app so that uninstalling the app
         * never touches the sibling data folder. Falls back to the user's
         * local programs directory when the machine has no ready D: drive.
         */
        public static string DefaultInstallDir()
        {
            try
            {
                DriveInfo drive = new DriveInfo("D");
                if (drive.IsReady) return @"D:\ZALEANAI\app";
            }
            catch { }

            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                AppName);
        }

        public static void Install(string dir, bool desktopShortcut, bool launch, bool silent)
        {
            dir = (dir ?? "").Trim().TrimEnd('\\');
            if (dir.Length == 0)
                throw new Exception("请选择安装位置。");

            if (IsInside(DataDir, dir))
                throw new Exception(
                    "不能把程序装到数据目录或它的上级目录里：\r\n" + DataDir
                    + "\r\n\r\n请换一个位置，例如 D:\\ZALEANAI\\app。");

            Log("开始安装到 " + dir + "，版本 " + BuildInfo.Version);

            KillRunning();

            try { Directory.CreateDirectory(dir); }
            catch (Exception error)
            {
                throw new Exception("无法创建安装目录：\r\n" + dir + "\r\n\r\n" + error.Message);
            }

            string exePath = Path.Combine(dir, ExeName);
            byte[] bytes = ReadPayload();
            try { File.WriteAllBytes(exePath, bytes); }
            catch (Exception error)
            {
                throw new Exception("写入程序文件失败：\r\n" + exePath + "\r\n\r\n" + error.Message);
            }
            Log("写入 " + exePath + "（" + bytes.Length + " 字节）");

            CreateShortcuts(dir, exePath, desktopShortcut);
            RegisterUninstall(dir, exePath);

            if (launch)
            {
                try
                {
                    ProcessStartInfo info = new ProcessStartInfo(exePath);
                    info.UseShellExecute = true;
                    info.WorkingDirectory = dir;
                    Process.Start(info);
                }
                catch (Exception error)
                {
                    Log("自动启动失败：" + error.Message);
                    if (!silent)
                        MessageBox.Show(
                            "安装完成，但没能自动启动。请双击桌面上的 ZALEANAI 打开。\r\n\r\n"
                            + error.Message,
                            AppName,
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information);
                }
            }
        }

        private static byte[] ReadPayload()
        {
            if (payload != null) return payload;

            using (Stream stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("payload/" + ExeName))
            {
                if (stream == null)
                    throw new Exception("安装包损坏：找不到内嵌的 ZALEANAI.exe。");

                payload = new byte[stream.Length];
                int offset = 0;
                while (offset < payload.Length)
                {
                    int read = stream.Read(payload, offset, payload.Length - offset);
                    if (read <= 0) break;
                    offset += read;
                }
                payloadBytes = payload.Length;
                return payload;
            }
        }

        private static void KillRunning()
        {
            foreach (Process process in Process.GetProcessesByName("ZALEANAI"))
            {
                try
                {
                    process.Kill();
                    process.WaitForExit(3000);
                    Log("已关闭正在运行的 ZALEANAI（PID " + process.Id + "）");
                }
                catch (Exception error)
                {
                    Log("关闭运行中的 ZALEANAI 失败：" + error.Message);
                }
            }
        }

        private static void CreateShortcuts(string dir, string exePath, bool desktopShortcut)
        {
            string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            string menuFolder = Path.Combine(programs, AppName);

            try
            {
                Directory.CreateDirectory(menuFolder);
                MakeShortcut(
                    Path.Combine(menuFolder, AppName + ".lnk"),
                    exePath, null, dir, AppName);
                MakeShortcut(
                    Path.Combine(menuFolder, "卸载" + AppName + ".lnk"),
                    exePath, "--uninstall", dir, "卸载" + AppName);
            }
            catch (Exception error)
            {
                Log("创建开始菜单快捷方式失败：" + error.Message);
            }

            if (!desktopShortcut) return;
            try
            {
                MakeShortcut(
                    Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                        AppName + ".lnk"),
                    exePath, null, dir, AppName);
            }
            catch (Exception error)
            {
                Log("创建桌面快捷方式失败：" + error.Message);
            }
        }

        private static void RegisterUninstall(string dir, string exePath)
        {
            try
            {
                if (payloadBytes == 0) ReadPayload();
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
                {
                    key.SetValue("DisplayName", AppName);
                    key.SetValue("DisplayVersion", BuildInfo.Version);
                    key.SetValue("Publisher", AppName);
                    key.SetValue("DisplayIcon", exePath + ",0");
                    key.SetValue("InstallLocation", dir);
                    key.SetValue("UninstallString", "\"" + exePath + "\" --uninstall");
                    key.SetValue("QuietUninstallString", "\"" + exePath + "\" --uninstall /S");
                    key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                    key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                    key.SetValue(
                        "EstimatedSize",
                        (int)Math.Max(1, payloadBytes / 1024),
                        RegistryValueKind.DWord);
                }
            }
            catch (Exception error)
            {
                Log("写入卸载登记失败：" + error.Message);
            }
        }

        private static void MakeShortcut(
            string linkPath, string target, string arguments, string workingDir, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new Exception("系统里没有 Windows Script Host");
            object shell = Activator.CreateInstance(shellType);
            object link = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { linkPath });
            Type linkType = link.GetType();
            linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
            if (arguments != null)
                linkType.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { arguments });
            linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { workingDir });
            linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { description });
            linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { target + ",0" });
            linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
        }

        private static bool IsInside(string child, string parent)
        {
            try
            {
                string c = Path.GetFullPath(child).TrimEnd('\\') + "\\";
                string p = Path.GetFullPath(parent).TrimEnd('\\') + "\\";
                return c.StartsWith(p, StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private static string LogPath()
        {
            return Path.Combine(Path.GetTempPath(), "ZALEANAI-安装日志.txt");
        }

        public static void Log(string message)
        {
            try
            {
                File.AppendAllText(
                    LogPath(),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                        + "  " + message + "\r\n",
                    new UTF8Encoding(false));
            }
            catch { }
        }
    }

    internal sealed class InstallForm : Form
    {
        private readonly TextBox pathBox;
        private readonly CheckBox desktopBox;
        private readonly CheckBox launchBox;
        private readonly Button installButton;
        private readonly Button cancelButton;
        private readonly Label statusLabel;

        public InstallForm()
        {
            Text = "ZALEANAI 安装程序";
            ClientSize = new Size(560, 340);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowIcon = true;
            try { Icon = LoadIcon(); } catch { }

            Label title = new Label();
            title.Text = "ZALEANAI";
            title.Font = new Font(Font.FontFamily, 18F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(24, 20);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "AI 聊天客户端 · 摄像头拍照 · 画板";
            subtitle.AutoSize = true;
            subtitle.ForeColor = Color.DimGray;
            subtitle.Location = new Point(26, 56);
            Controls.Add(subtitle);

            Label version = new Label();
            version.Text = "版本 " + BuildInfo.Version;
            version.AutoSize = true;
            version.ForeColor = Color.DimGray;
            version.Location = new Point(430, 30);
            Controls.Add(version);

            Label pathLabel = new Label();
            pathLabel.Text = "安装位置：";
            pathLabel.AutoSize = true;
            pathLabel.Location = new Point(26, 96);
            Controls.Add(pathLabel);

            pathBox = new TextBox();
            pathBox.Text = Installer.DefaultInstallDir();
            pathBox.Location = new Point(104, 93);
            pathBox.Size = new Size(350, 24);
            Controls.Add(pathBox);

            Button browse = new Button();
            browse.Text = "浏览…";
            browse.Location = new Point(462, 92);
            browse.Size = new Size(72, 26);
            browse.Click += delegate
            {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "选择 ZALEANAI 的安装位置";
                    dialog.SelectedPath = pathBox.Text;
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                        pathBox.Text = dialog.SelectedPath;
                }
            };
            Controls.Add(browse);

            desktopBox = new CheckBox();
            desktopBox.Text = "在桌面创建快捷方式";
            desktopBox.Checked = true;
            desktopBox.AutoSize = true;
            desktopBox.Location = new Point(104, 132);
            Controls.Add(desktopBox);

            launchBox = new CheckBox();
            launchBox.Text = "安装完成后立即启动 ZALEANAI";
            launchBox.Checked = true;
            launchBox.AutoSize = true;
            launchBox.Location = new Point(104, 160);
            Controls.Add(launchBox);

            Label note = new Label();
            note.Text = "对话与设置保存在 D:\\ZALEANAI\\data，卸载时不会删除。\r\n"
                + "如果电脑没有 D 盘，会自动改用当前用户目录。\r\n"
                + "首次启动后可在 D:\\ZALEANAI\\data\\config.json 中配置模型端点。";
            note.AutoSize = true;
            note.ForeColor = Color.DimGray;
            note.Location = new Point(26, 198);
            Controls.Add(note);

            statusLabel = new Label();
            statusLabel.Text = "准备安装";
            statusLabel.AutoSize = true;
            statusLabel.Location = new Point(26, 274);
            Controls.Add(statusLabel);

            installButton = new Button();
            installButton.Text = "安装";
            installButton.Location = new Point(360, 296);
            installButton.Size = new Size(84, 30);
            installButton.Click += delegate { StartInstall(); };
            Controls.Add(installButton);

            cancelButton = new Button();
            cancelButton.Text = "取消";
            cancelButton.Location = new Point(454, 296);
            cancelButton.Size = new Size(80, 30);
            cancelButton.Click += delegate { Close(); };
            Controls.Add(cancelButton);

            CancelButton = cancelButton;
            AcceptButton = installButton;
        }

        private void StartInstall()
        {
            string dir = pathBox.Text.Trim();
            SetBusy(true);

            try
            {
                SetStatus("正在关闭已运行的 ZALEANAI…");
                Installer.Install(dir, desktopBox.Checked, false, false);
                SetStatus("安装完成");
                MessageBox.Show(
                    "ZALEANAI 安装完成。\r\n\r\n"
                    + "程序位置：" + dir + "\r\n"
                    + "数据目录：D:\\ZALEANAI\\data（首次启动时创建）\r\n\r\n"
                    + "可以在 D:\\ZALEANAI\\data\\config.json 中配置模型端点。",
                    "ZALEANAI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);

                if (launchBox.Checked)
                {
                    try
                    {
                        ProcessStartInfo info = new ProcessStartInfo(
                            Path.Combine(dir, Installer.ExeName));
                        info.UseShellExecute = true;
                        info.WorkingDirectory = dir;
                        Process.Start(info);
                    }
                    catch (Exception error)
                    {
                        MessageBox.Show(
                            "程序已安装，但没能自动启动：\r\n" + error.Message,
                            "ZALEANAI",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
                    }
                }
                Close();
            }
            catch (Exception error)
            {
                SetStatus("安装失败");
                MessageBox.Show(
                    error.Message,
                    "ZALEANAI 安装失败",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                SetBusy(false);
            }
        }

        private void SetStatus(string text)
        {
            statusLabel.Text = text;
            Application.DoEvents();
        }

        private void SetBusy(bool busy)
        {
            pathBox.Enabled = !busy;
            desktopBox.Enabled = !busy;
            launchBox.Enabled = !busy;
            installButton.Enabled = !busy;
            cancelButton.Enabled = !busy;
        }

        private static Icon LoadIcon()
        {
            try
            {
                using (Stream stream = Assembly.GetExecutingAssembly()
                    .GetManifestResourceStream("meta/icon.ico"))
                {
                    if (stream != null) return new Icon(stream);
                }
            }
            catch { }
            return SystemIcons.Application;
        }
    }
}
