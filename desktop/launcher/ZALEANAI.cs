using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ZaleanaiDesktop
{
    /**
     * ZALEANAI desktop launcher.
     *
     * The Next.js export is embedded as resources and served from a loopback
     * port, then opened as an Edge/Chrome app window with a dedicated profile.
     * The profile is what makes the conversation data land on D: without
     * touching the browser's normal profile: localStorage, settings and the
     * model override all live in <data>\browser-profile.
     */
    internal static class Program
    {
        private const int Port = 47821;
        private const string Url = "http://127.0.0.1:47821/";
        private const string Marker = "X-ZALEANAIDesktop";
        private const string Prefix = "app/";
        private const string AppName = "ZALEANAI";
        private const string DataFolderName = "ZALEANAI";
        private const string ExeName = "ZALEANAI.exe";
        private const string ConfigFileName = "config.json";
        private const string ReadmeFileName = "使用说明.txt";
        private const string UninstallKey =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ZALEANAI";

        private const int Free = 0, Ours = 1, Foreign = 2;

        private const string DefaultConfig = @"{
    ""appName"": ""ZALEANAI"",
    ""defaultModel"": ""ollama-vision"",
    ""models"": [
        {
            ""id"": ""ollama-vision"",
            ""name"": ""Ollama 视觉模型"",
            ""baseUrl"": ""http://127.0.0.1:11434/v1"",
            ""type"": ""openai"",
            ""model"": ""llama3.2-vision"",
            ""streaming"": true,
            ""modalities"": { ""image"": true }
        },
        {
            ""id"": ""ollama"",
            ""name"": ""Ollama 本地模型"",
            ""baseUrl"": ""http://127.0.0.1:11434/v1"",
            ""type"": ""openai"",
            ""model"": ""llama3.2"",
            ""streaming"": true
        }
    ]
}
";

        private const string ReadmeText =
            "ZALEANAI 数据目录\r\n"
            + "================\r\n\r\n"
            + "config.json        模型端点配置。改完保存，在应用里刷新页面即可生效。\r\n"
            + "browser-profile/   对话、设置、登录状态等（浏览器本地存储）。\r\n"
            + "launcher.log       启动与卸载日志。\r\n\r\n"
            + "备份：复制整个 data 文件夹；也可以在应用内打开 设置 → 数据 → 导出对话。\r\n"
            + "卸载程序不会删除本文件夹。\r\n";

        // Declared before DataRoot so a fallback note can be recorded first.
        private static string startupNote = null;
        private static readonly string DataRoot = ResolveDataRoot();
        private static readonly string ProfileRoot = Path.Combine(DataRoot, "browser-profile");
        private static readonly Dictionary<string, string> Files = IndexResources();
        private static TrayApp tray = null;

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            EnsureDataFiles();
            if (startupNote != null) Log(startupNote);

            string[] argv = Environment.GetCommandLineArgs();
            if (HasFlag(argv, "--uninstall"))
            {
                Uninstall(HasFlag(argv, "/S"));
                return;
            }

            int probe = ProbePort();
            if (probe == Ours)
            {
                Log("已在运行，只打开窗口");
                OpenWindow();
                return;
            }
            if (probe == Foreign)
            {
                Warn("端口 " + Port + " 被其他程序占用了，ZALEANAI 无法启动本地服务。\r\n\r\n"
                    + "请关闭占用该端口的程序后再试。\r\n\r\n日志：" + LogPath());
                return;
            }

            List<TcpListener> listeners = Listen();
            if (listeners.Count == 0)
            {
                Warn("无法启动本地服务（端口 " + Port + "）。\r\n\r\n"
                    + "请检查端口是否被占用、防火墙是否拦截了本机回环地址。\r\n\r\n日志：" + LogPath());
                return;
            }
            foreach (TcpListener listener in listeners) Serve(listener);
            Log("服务已启动：" + Url);

            if (!"1".Equals(Environment.GetEnvironmentVariable("NO_OPEN")))
                OpenWindow();

            tray = new TrayApp(listeners);
            Application.Run(tray);
        }

        /* ------------------------------------------------------------ data */

        private static string ResolveDataRoot()
        {
            string[] candidates = new string[]
            {
                @"D:\" + DataFolderName + @"\data",
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    DataFolderName,
                    "data"),
                Path.Combine(Path.GetTempPath(), DataFolderName + "-data"),
            };

            foreach (string candidate in candidates)
            {
                try
                {
                    Directory.CreateDirectory(candidate);
                    string probe = Path.Combine(candidate, ".write-probe");
                    File.WriteAllText(probe, "ok");
                    File.Delete(probe);
                    if (candidate != candidates[0])
                        startupNote = "D 盘数据目录不可用，改用：" + candidate;
                    return candidate;
                }
                catch (Exception error)
                {
                    if (candidate == candidates[0])
                        startupNote = "D 盘数据目录不可用（" + error.Message + "），正在尝试备用位置";
                }
            }

            // Last resort: the process temp directory.
            return Path.GetTempPath();
        }

        private static void EnsureDataFiles()
        {
            try { Directory.CreateDirectory(DataRoot); } catch { }
            try { Directory.CreateDirectory(ProfileRoot); } catch { }

            string config = Path.Combine(DataRoot, ConfigFileName);
            if (!File.Exists(config))
            {
                try { File.WriteAllText(config, DefaultConfig, new UTF8Encoding(false)); }
                catch (Exception error) { Log("写入默认 config.json 失败：" + error.Message); }
            }

            string readme = Path.Combine(DataRoot, ReadmeFileName);
            if (!File.Exists(readme))
            {
                try { File.WriteAllText(readme, ReadmeText, new UTF8Encoding(false)); }
                catch { }
            }
        }

        private static string ConfigPath()
        {
            return Path.Combine(DataRoot, ConfigFileName);
        }

        /* ------------------------------------------------------------ http */

        private static Dictionary<string, string> IndexResources()
        {
            Dictionary<string, string> map =
                new Dictionary<string, string>(StringComparer.Ordinal);
            Assembly self = Assembly.GetExecutingAssembly();
            foreach (string name in self.GetManifestResourceNames())
            {
                if (name.StartsWith(Prefix, StringComparison.Ordinal))
                    map["/" + name.Substring(Prefix.Length)] = name;
            }
            return map;
        }

        private static List<TcpListener> Listen()
        {
            List<TcpListener> bound = new List<TcpListener>();
            IPAddress[] addresses = new IPAddress[]
            {
                IPAddress.Loopback,
                IPAddress.IPv6Loopback,
            };
            foreach (IPAddress address in addresses)
            {
                try
                {
                    TcpListener listener = new TcpListener(address, Port);
                    listener.Start();
                    bound.Add(listener);
                }
                catch (Exception error)
                {
                    Log("绑定 " + address + " 失败：" + error.Message);
                }
            }
            return bound;
        }

        private static void Serve(TcpListener listener)
        {
            Thread thread = new Thread(delegate()
            {
                while (true)
                {
                    TcpClient client;
                    try { client = listener.AcceptTcpClient(); }
                    catch { return; }
                    ThreadPool.QueueUserWorkItem(
                        delegate(object state) { Handle((TcpClient)state); },
                        client);
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        private static void Handle(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 5000;
                    client.SendTimeout = 10000;
                    NetworkStream stream = client.GetStream();

                    string head = ReadHead(stream);
                    string method;
                    string path;
                    string query;
                    ParseRequest(head, out method, out path, out query);
                    bool headOnly = "HEAD".Equals(method, StringComparison.Ordinal);

                    if (!"GET".Equals(method, StringComparison.Ordinal) && !headOnly)
                    {
                        Write(stream, 405, "text/plain; charset=utf-8",
                            Encoding.UTF8.GetBytes("405 不支持该请求方法"), false);
                        return;
                    }

                    if (path == null)
                    {
                        Write(stream, 400, "text/plain; charset=utf-8",
                            Encoding.UTF8.GetBytes("400 请求无效"), headOnly);
                        return;
                    }

                    if (path == "/" + ConfigFileName)
                    {
                        byte[] config;
                        try { config = File.ReadAllBytes(ConfigPath()); }
                        catch (Exception error)
                        {
                            Log("读取 config.json 失败：" + error.Message);
                            Write(stream, 500, "text/plain; charset=utf-8",
                                Encoding.UTF8.GetBytes("500 config.json 读取失败"), headOnly);
                            return;
                        }
                        Write(stream, 200, "application/json; charset=utf-8", config, headOnly);
                        return;
                    }

                    byte[] body;
                    string type;
                    if (!TryRead(path, out body, out type))
                    {
                        // SPA-style fallbacks for the static export.
                        if (!Path.HasExtension(path) && path != "/")
                        {
                            if (TryRead(path + ".html", out body, out type))
                            {
                                Write(stream, 200, type, body, headOnly);
                                return;
                            }
                        }
                        if (path == "/favicon.ico" && TryRead("/icon.png", out body, out type))
                        {
                            Write(stream, 200, type, body, headOnly);
                            return;
                        }
                        Write(stream, 404, "text/plain; charset=utf-8",
                            Encoding.UTF8.GetBytes("404 未找到"), headOnly);
                        return;
                    }

                    Write(stream, 200, type, body, headOnly);
                }
                catch
                {
                    // A broken request only breaks that request.
                }
            }
        }

        private static string ReadHead(NetworkStream stream)
        {
            MemoryStream buffer = new MemoryStream();
            byte[] chunk = new byte[2048];
            while (buffer.Length < 65536)
            {
                int read = stream.Read(chunk, 0, chunk.Length);
                if (read <= 0) break;
                buffer.Write(chunk, 0, read);

                byte[] all = buffer.GetBuffer();
                int end = (int)buffer.Length;
                for (int i = Math.Max(0, end - read - 3); i <= end - 4; i++)
                {
                    if (all[i] == 13 && all[i + 1] == 10
                        && all[i + 2] == 13 && all[i + 3] == 10)
                        return Encoding.ASCII.GetString(all, 0, i);
                }
            }
            return buffer.Length > 0 ? Encoding.ASCII.GetString(buffer.ToArray()) : null;
        }

        private static void ParseRequest(
            string head, out string method, out string path, out string query)
        {
            method = null;
            path = null;
            query = null;
            if (head == null) return;

            string[] lines = head.Split('\n');
            if (lines.Length == 0) return;
            string[] parts = lines[0].Trim().Split(' ');
            if (parts.Length < 2) return;

            method = parts[0].ToUpperInvariant();
            path = parts[1];
            int start = path.IndexOf('?');
            if (start >= 0)
            {
                query = path.Substring(start + 1);
                path = path.Substring(0, start);
            }

            try { path = Uri.UnescapeDataString(path); }
            catch { path = null; return; }

            if (path.Length == 0 || path[0] != '/') { path = null; return; }
            if (path.IndexOf("..", StringComparison.Ordinal) >= 0) { path = null; return; }
            if (path.EndsWith("/", StringComparison.Ordinal)) path += "index.html";
        }

        private static bool TryRead(string path, out byte[] body, out string type)
        {
            body = null;
            type = null;
            string resource;
            if (!Files.TryGetValue(path, out resource)) return false;

            using (Stream stream =
                Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
            {
                if (stream == null) return false;
                body = new byte[stream.Length];
                int offset = 0;
                while (offset < body.Length)
                {
                    int read = stream.Read(body, offset, body.Length - offset);
                    if (read <= 0) break;
                    offset += read;
                }
            }
            type = MimeOf(path);
            return true;
        }

        private static string MimeOf(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "text/javascript; charset=utf-8";
                case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": return "image/jpeg";
                case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".webp": return "image/webp";
                case ".avif": return "image/avif";
                case ".ico": return "image/x-icon";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                case ".ttf": return "font/ttf";
                case ".otf": return "font/otf";
                case ".txt": return "text/plain; charset=utf-8";
                case ".xml": return "application/xml; charset=utf-8";
                case ".webmanifest": return "application/manifest+json";
                case ".wasm": return "application/wasm";
                case ".map": return "application/json; charset=utf-8";
                default: return "application/octet-stream";
            }
        }

        private static void Write(
            NetworkStream stream, int status, string type, byte[] body, bool headOnly)
        {
            string head = "HTTP/1.1 " + status.ToString(CultureInfo.InvariantCulture)
                + " " + ReasonOf(status) + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.Length.ToString(CultureInfo.InvariantCulture) + "\r\n"
                + "Cache-Control: no-store\r\n"
                + Marker + ": 1\r\n"
                + "Connection: close\r\n\r\n";
            byte[] headBytes = Encoding.ASCII.GetBytes(head);
            stream.Write(headBytes, 0, headBytes.Length);
            if (!headOnly) stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        private static string ReasonOf(int status)
        {
            switch (status)
            {
                case 200: return "OK";
                case 400: return "Bad Request";
                case 405: return "Method Not Allowed";
                case 404: return "Not Found";
                case 500: return "Internal Server Error";
                default: return "Error";
            }
        }

        /* ------------------------------------------------------------ probe */

        private static int ProbePort()
        {
            int v4 = ProbeOne(AddressFamily.InterNetwork);
            if (v4 == Ours) return Ours;
            int v6 = ProbeOne(AddressFamily.InterNetworkV6);
            if (v6 == Ours) return Ours;
            return (v4 == Foreign || v6 == Foreign) ? Foreign : Free;
        }

        private static int ProbeOne(AddressFamily family)
        {
            try
            {
                IPAddress address = family == AddressFamily.InterNetwork
                    ? IPAddress.Loopback
                    : IPAddress.IPv6Loopback;

                using (TcpClient client = new TcpClient(family))
                {
                    client.ReceiveTimeout = 1000;
                    IAsyncResult connect = client.BeginConnect(address, Port, null, null);
                    if (!connect.AsyncWaitHandle.WaitOne(400)) return Free;
                    client.EndConnect(connect);

                    using (NetworkStream stream = client.GetStream())
                    {
                        byte[] ask = Encoding.ASCII.GetBytes(
                            "GET / HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n");
                        stream.Write(ask, 0, ask.Length);
                        string head = ReadHead(stream);
                        return head != null && head.Contains(Marker) ? Ours : Foreign;
                    }
                }
            }
            catch
            {
                return Free;
            }
        }

        /* ------------------------------------------------------------ window */

        private static string FindBrowser()
        {
            string[] candidates = new string[]
            {
                Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    @"Microsoft\Edge\Application\msedge.exe"),
                Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    @"Microsoft\Edge\Application\msedge.exe"),
                Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Microsoft\Edge\Application\msedge.exe"),
                Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    @"Google\Chrome\Application\chrome.exe"),
                Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    @"Google\Chrome\Application\chrome.exe"),
                Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string path in candidates)
            {
                if (path != null && File.Exists(path)) return path;
            }
            return null;
        }

        private static string Combine(string root, string rest)
        {
            return string.IsNullOrEmpty(root) ? null : Path.Combine(root, rest);
        }

        private static void OpenWindow()
        {
            try { Directory.CreateDirectory(ProfileRoot); } catch { }

            string browser = FindBrowser();
            if (browser != null)
            {
                try
                {
                    ProcessStartInfo info = new ProcessStartInfo(browser);
                    info.Arguments = "--app=" + Url
                        + " --user-data-dir=\"" + ProfileRoot + "\""
                        + " --no-first-run --no-default-browser-check"
                        + " --disable-features=Translate --lang=zh-CN";
                    string debugPort = Environment.GetEnvironmentVariable("ZALEANAI_DEBUG_PORT");
                    if (!string.IsNullOrEmpty(debugPort))
                        info.Arguments += " --remote-debugging-port=" + debugPort;
                    info.UseShellExecute = false;
                    Process.Start(info);
                    Log("已用 " + browser + " 打开应用窗口");
                    return;
                }
                catch (Exception error)
                {
                    Log("打开 Edge/Chrome 失败：" + error.Message);
                }
            }

            try
            {
                Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
                Log("已用系统默认浏览器打开");
                Warn("没有找到 Edge 或 Chrome，已用默认浏览器打开。\r\n\r\n"
                    + "对话数据将保存在默认浏览器的配置里，而不是 D 盘的 ZALEANAI 数据目录。");
            }
            catch (Exception error)
            {
                Warn("打不开浏览器窗口：" + error.Message + "\r\n\r\n请手动访问 " + Url);
            }
        }

        /* ------------------------------------------------------------ tray */

        private sealed class TrayApp : ApplicationContext
        {
            private readonly NotifyIcon icon;
            private readonly List<TcpListener> listeners;

            public TrayApp(List<TcpListener> listeners)
            {
                this.listeners = listeners;

                ContextMenuStrip menu = new ContextMenuStrip();
                menu.Items.Add("打开 ZALEANAI", null, delegate { OpenWindow(); });
                menu.Items.Add("打开数据文件夹", null, delegate { OpenDataFolder(); });
                menu.Items.Add(new ToolStripSeparator());
                menu.Items.Add("退出", null, delegate { Quit(); });

                icon = new NotifyIcon();
                icon.Icon = LoadIcon();
                icon.Text = AppName;
                icon.ContextMenuStrip = menu;
                icon.DoubleClick += delegate { OpenWindow(); };
                icon.Visible = true;

                string tip = Path.Combine(DataRoot, ".tray-tip-shown");
                if (!File.Exists(tip))
                {
                    try { File.WriteAllText(tip, ""); } catch { }
                    icon.ShowBalloonTip(6000, AppName,
                        "ZALEANAI 已在后台运行。\r\n数据目录：" + DataRoot
                        + "\r\n关闭窗口后可从任务栏右下角的托盘图标重新打开或退出。",
                        ToolTipIcon.Info);
                }
            }

            private void OpenDataFolder()
            {
                try
                {
                    ProcessStartInfo info = new ProcessStartInfo("explorer.exe");
                    info.Arguments = "\"" + DataRoot + "\"";
                    info.UseShellExecute = true;
                    Process.Start(info);
                }
                catch (Exception error)
                {
                    Warn("打不开数据文件夹：" + error.Message + "\r\n\r\n" + DataRoot);
                }
            }

            private void Quit()
            {
                foreach (TcpListener listener in listeners)
                {
                    try { listener.Stop(); } catch { }
                }
                icon.Visible = false;
                icon.Dispose();
                ExitThread();
            }
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

        /* ------------------------------------------------------------ uninstall */

        private static void Uninstall(bool silent)
        {
            string installDir = Application.StartupPath;
            string installed = null;
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
                {
                    if (key != null) installed = key.GetValue("InstallLocation") as string;
                }
            }
            catch { }

            if (installed == null || !SamePath(installed, installDir))
            {
                if (!silent)
                    Warn("没有找到 ZALEANAI 的安装信息。\r\n\r\n"
                        + "如果这是便携版，直接删除 exe 即可；数据文件夹请自行保留。");
                return;
            }

            if (!silent)
            {
                DialogResult answer = MessageBox.Show(
                    "确定要卸载 ZALEANAI 吗？\r\n\r\n"
                    + "对话与设置会保留在：\r\n" + DataRoot,
                    "卸载 ZALEANAI",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (answer != DialogResult.Yes) return;
            }

            foreach (Process process in Process.GetProcessesByName("ZALEANAI"))
            {
                if (process.Id == Process.GetCurrentProcess().Id) continue;
                try
                {
                    process.Kill();
                    process.WaitForExit(3000);
                }
                catch { }
            }

            RemoveShortcuts();
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); }
            catch (Exception error) { Log("删除卸载登记失败：" + error.Message); }

            if (!IsInside(DataRoot, installDir))
                ScheduleDirectoryDelete(installDir);
            else
                Log("安装目录包含数据目录，跳过整目录删除：" + installDir);

            if (!silent)
            {
                MessageBox.Show(
                    "ZALEANAI 已卸载。\r\n\r\n对话与设置仍保留在：\r\n" + DataRoot,
                    "卸载 ZALEANAI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
        }

        private static void RemoveShortcuts()
        {
            string desktop = Environment.GetFolderPath(
                Environment.SpecialFolder.DesktopDirectory);
            string programs = Environment.GetFolderPath(
                Environment.SpecialFolder.Programs);

            TryDelete(Path.Combine(desktop, AppName + ".lnk"));
            TryDelete(Path.Combine(programs, AppName, AppName + ".lnk"));
            TryDelete(Path.Combine(programs, AppName, "卸载" + AppName + ".lnk"));
            try
            {
                string folder = Path.Combine(programs, AppName);
                if (Directory.Exists(folder) && Directory.GetFileSystemEntries(folder).Length == 0)
                    Directory.Delete(folder);
            }
            catch { }
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); }
            catch (Exception error) { Log("删除快捷方式失败 " + path + "：" + error.Message); }
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

        private static bool SamePath(string a, string b)
        {
            try
            {
                return string.Equals(
                    Path.GetFullPath(a), Path.GetFullPath(b),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private static void ScheduleDirectoryDelete(string dir)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(
                    "cmd.exe",
                    "/c ping -n 3 127.0.0.1 > nul & rmdir /s /q \"" + dir + "\"");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(info);
                Log("已安排删除安装目录：" + dir);
            }
            catch (Exception error) { Log("安排删除失败：" + error.Message); }
        }

        /* ------------------------------------------------------------ misc */

        private static bool HasFlag(string[] argv, string flag)
        {
            foreach (string item in argv)
            {
                if (string.Equals(item, flag, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static string LogPath()
        {
            return Path.Combine(DataRoot, "launcher.log");
        }

        private static void Log(string message)
        {
            try
            {
                File.AppendAllText(
                    LogPath(),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
                        + "  " + message + "\r\n",
                    new UTF8Encoding(false));
            }
            catch { }
        }

        private static void Warn(string message)
        {
            try
            {
                MessageBox.Show(message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            catch { }
        }
    }
}
