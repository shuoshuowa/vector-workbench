using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class Workbench : Form
{
    private const string Host = "vector-workbench.example";
    private readonly WebView2 view = new WebView2();
    private bool closingApproved;
    private bool checkingChanges;

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Workbench());
    }

    private Workbench()
    {
        Text = "矢量快改 · Vector Workbench";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        MinimumSize = new Size(800, 560);
        Size = new Size(1440, 900);
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        Shown += Initialize;
        FormClosing += ConfirmClose;
    }

    private async void Initialize(object sender, EventArgs args)
    {
        try
        {
            string assets = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app");
            if (!File.Exists(Path.Combine(assets, "index.html")))
                throw new FileNotFoundException("请完整解压下载的 ZIP 后再启动。缺少 app 文件夹。");
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "VectorWorkbench", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.SetVirtualHostNameToFolderMapping(Host, assets, CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting += (s, e) => {
                Uri url;
                e.Cancel = !Uri.TryCreate(e.Uri, UriKind.Absolute, out url) || url.Scheme != "https" || url.Host != Host;
            };
            core.NewWindowRequested += (s, e) => {
                e.Handled = true;
                Uri url;
                if (!e.IsUserInitiated || !Uri.TryCreate(e.Uri, UriKind.Absolute, out url)) return;
                if (url.Host == Host && url.AbsolutePath.StartsWith("/licenses", StringComparison.Ordinal))
                    Process.Start(new ProcessStartInfo(Path.Combine(assets, "licenses", "index.html")) { UseShellExecute = true });
                else if (url.Scheme == "https" && url.Host != Host)
                    Process.Start(new ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true });
            };
            core.DownloadStarting += SaveExport;
            core.Navigate("https://" + Host + "/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this, "需要 Microsoft Edge WebView2 Runtime。请按压缩包中《使用说明》的链接安装，然后重新打开工作台。",
                Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void SaveExport(object sender, CoreWebView2DownloadStartingEventArgs e)
    {
        // Defer the native dialog until WebView2 returns from the event callback.
        var deferral = e.GetDeferral();
        BeginInvoke((Action)delegate {
            try
            {
                using (var save = new SaveFileDialog())
                {
                    save.FileName = Path.GetFileName(e.ResultFilePath);
                    save.RestoreDirectory = true;
                    save.Title = "保存导出文件";
                    if (save.ShowDialog(this) == DialogResult.OK)
                        e.ResultFilePath = save.FileName;
                    else
                        e.Cancel = true;
                    e.Handled = true;
                }
            }
            finally { deferral.Complete(); }
        });
    }

    private async void ConfirmClose(object sender, FormClosingEventArgs e)
    {
        if (closingApproved || e.CloseReason != CloseReason.UserClosing || view.CoreWebView2 == null) return;
        e.Cancel = true;
        if (checkingChanges) return;
        checkingChanges = true;
        bool dirty = true;
        try { dirty = await view.CoreWebView2.ExecuteScriptAsync(
            "document.getElementById('modified')?.hidden === false") == "true"; }
        catch (InvalidOperationException) { }
        catch (System.Runtime.InteropServices.COMException) { }
        checkingChanges = false;
        if (dirty && MessageBox.Show(this, "当前工作区有修改。确定退出吗？", Text,
            MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
        closingApproved = true;
        BeginInvoke((Action)Close);
    }
}
