using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

public static class Mr9NativeDrag
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    private const uint MouseLeftDown = 0x0002;
    private const uint MouseLeftUp = 0x0004;

    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length != 4)
        {
            Console.Error.WriteLine("usage: mr9-native-drag <url|folder> <payload> <target-x> <target-y>");
            return 2;
        }

        int targetX;
        int targetY;
        if (!int.TryParse(args[2], out targetX) || !int.TryParse(args[3], out targetY))
        {
            Console.Error.WriteLine("target coordinates must be integers");
            return 2;
        }

        var data = new DataObject();
        if (args[0] == "url")
        {
            data.SetData(DataFormats.Text, args[1]);
            data.SetData(DataFormats.UnicodeText, args[1]);
            data.SetData("text/uri-list", args[1] + "\r\n");
        }
        else if (args[0] == "folder")
        {
            data.SetData(DataFormats.FileDrop, new[] { args[1] });
        }
        else
        {
            Console.Error.WriteLine("mode must be url or folder");
            return 2;
        }

        Application.EnableVisualStyles();
        using (var source = new Form())
        {
            source.ShowInTaskbar = false;
            source.FormBorderStyle = FormBorderStyle.None;
            source.StartPosition = FormStartPosition.Manual;
            source.Location = new Point(-30000, -30000);
            source.Size = new Size(1, 1);
            source.Show();
            source.CreateControl();

            SetCursorPos(targetX - 120, targetY - 80);
            mouse_event(MouseLeftDown, 0, 0, 0, UIntPtr.Zero);

            var mover = new Thread(() =>
            {
                Thread.Sleep(250);
                SetCursorPos(targetX, targetY);
                Thread.Sleep(350);
                mouse_event(MouseLeftUp, 0, 0, 0, UIntPtr.Zero);
            });
            mover.IsBackground = true;
            mover.Start();

            var result = source.DoDragDrop(data, DragDropEffects.Copy);
            mover.Join(1000);
            Console.WriteLine(result.ToString());
            return result == DragDropEffects.None ? 1 : 0;
        }
    }
}
