using System;
using System.Linq;
using System.Threading;

public static class Program
{
    public static int Main(string[] args)
    {
        if (args.Contains("--version"))
        {
            Console.WriteLine("2026.08.15");
            return 0;
        }

        Console.WriteLine("[download] 5.0% of 20.00MiB at 1.00MiB/s ETA 00:04");
        Console.Out.Flush();
        Thread.Sleep(1500);
        Console.WriteLine("[download] 25.0% of 20.00MiB at 1.00MiB/s ETA 00:03");
        Console.Out.Flush();
        Thread.Sleep(1500);
        Console.WriteLine("[download] 50.0% of 20.00MiB at 1.00MiB/s ETA 00:02");
        Console.Out.Flush();
        Thread.Sleep(1500);
        return 1;
    }
}
