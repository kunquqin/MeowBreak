[2026-03-24T08:59:23.205Z] 启动动态壁纸（诊断日志：C:\Users\Administrator\AppData\Roaming\workbreak\desktop-wallpaper.log）
[2026-03-24T08:59:23.394Z] WorkerW 附着开始 childHwnd=2431804
[2026-03-24T08:59:23.707Z] WorkerW 附着脚本失败 exit=1 msg=Command failed: powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command 
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;

public class WbDesk {
  [StructLayout(LayoutKind.Sequential)] public struct RECT {
    public int Left, Top, Right, Bottom;
  }
  [StructLayout(LayoutKind.Sequential)] public struct POINT {
    public int X, Y;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MONITORINFOEX {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice;
  }

  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, ref IntPtr lpdwResult);
  [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, ref RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

  public const uint MONITORINFOF_PRIMARY = 1;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOACTIVATE = 0x0010;
  public const uint SWP_SHOWWINDOW = 0x0040;

  public static RECT PrimaryMonitorRect;
  public static bool GotPrimary;

  public static bool MonitorEnum(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData) {
    var mi = new MONITORINFOEX();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
    if (!GetMonitorInfo(hMonitor, ref mi)) return true;
    if ((mi.dwFlags & MONITORINFOF_PRIMARY) != 0) {
      PrimaryMonitorRect = mi.rcMonitor;
      GotPrimary = true;
      return false;
    }
    return true;
  }

  public static bool TryGetPrimaryMonitorRect(out RECT rc) {
    GotPrimary = false;
    PrimaryMonitorRect = new RECT();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, new MonitorEnumProc(MonitorEnum), IntPtr.Zero);
    rc = PrimaryMonitorRect;
    return GotPrimary;
  }
}
'@
$hwndChild = [IntPtr]2431804
$HWND_TOP = [IntPtr]::Zero
$HWND_BOTTOM = [IntPtr]1
$flMove = [uint32]([WbDesk]::SWP_NOACTIVATE -bor [WbDesk]::SWP_SHOWWINDOW)
$flZOnly = [uint32]([WbDesk]::SWP_NOSIZE -bor [WbDesk]::SWP_NOMOVE -bor [WbDesk]::SWP_NOACTIVATE)

function Get-FirstWallpaperWorkerW {
  param([IntPtr]$Progman)
  $w = [IntPtr]::Zero
  while ($true) {
    $w = [WbDesk]::FindWindowEx($Progman, $w, "WorkerW", $null)
    if ($w -eq [IntPtr]::Zero) { break }
    $def = [WbDesk]::FindWindowEx($w, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
    if ($def -eq [IntPtr]::Zero) { return $w }
  }
  return [IntPtr]::Zero
}

$rcPrim = New-Object WbDesk+RECT
if (-not [WbDesk]::TryGetPrimaryMonitorRect([ref]$rcPrim)) { exit 1 }
$primW = [int]($rcPrim.Right - $rcPrim.Left)
$primH = [int]($rcPrim.Bottom - $rcPrim.Top)
if ($primW -lt 1 -or $primH -lt 1) { exit 1 }

$progman = [WbDesk]::FindWindow("Progman", $null)
if ($progman -eq [IntPtr]::Zero) { exit 1 }
$r = [IntPtr]::Zero
[void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, [IntPtr]::Zero, 0u, 1000u, [ref]$r)
Start-Sleep -Milliseconds 120
[void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [IntPtr]1, 0u, 1000u, [ref]$r)
Start-Sleep -Milliseconds 280

$target = Get-FirstWallpaperWorkerW -Progman $progman
if ($target -eq [IntPtr]::Zero) {
  $w = [IntPtr]::Zero
  while ($true) {
    $w = [WbDesk]::FindWindowEx($progman, $w, "WorkerW", $null)
    if ($w -eq [IntPtr]::Zero) { break }
    $def = [WbDesk]::FindWindowEx($w, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
    if ($def -eq [IntPtr]::Zero) { $target = $w; break }
  }
}

if ($target -eq [IntPtr]::Zero) {
  $deskW = [IntPtr]::Zero
  $tw = [IntPtr]::Zero
  while ($true) {
    $tw = [WbDesk]::FindWindowEx([IntPtr]::Zero, $tw, "WorkerW", $null)
    if ($tw -eq [IntPtr]::Zero) { break }
    $def = [WbDesk]::FindWindowEx($tw, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
    if ($def -ne [IntPtr]::Zero) { $deskW = $tw }
  }
  if ($deskW -ne [IntPtr]::Zero) {
    $next = [WbDesk]::FindWindowEx([IntPtr]::Zero, $deskW, "WorkerW", $null)
    if ($next -ne [IntPtr]::Zero) {
      $d2 = [WbDesk]::FindWindowEx($next, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
      if ($d2 -eq [IntPtr]::Zero) { $target = $next }
    }
  }
}

if ($target -eq [IntPtr]::Zero) { exit 1 }

[void][WbDesk]::SetParent($hwndChild, $target)
if ([WbDesk]::GetParent($hwndChild) -ne $target) { exit 1 }

$pt = New-Object WbDesk+POINT
$pt.X = [int]$rcPrim.Left
$pt.Y = [int]$rcPrim.Top
if (-not [WbDesk]::ScreenToClient($target, [ref]$pt)) { exit 1 }

[void][WbDesk]::SetWindowPos($hwndChild, $HWND_TOP, $pt.X, $pt.Y, $primW, $primH, $flMove)
[void][WbDesk]::SetWindowPos($hwndChild, $HWND_BOTTOM, 0, 0, 0, 0, $flZOnly)
Write-Output ('WB_OK target=' + $target.ToInt64() + ' child=' + $hwndChild.ToInt64() + ' prim=' + $primW + 'x' + $primH + '@' + $rcPrim.Left + ',' + $rcPrim.Top)
exit 0

����λ�� ��:93 �ַ�: 45
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, ...
+                                             ~
��,������ȱ�ٱ���ʽ��
����λ�� ��:93 �ַ�: 46
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, ...
+                                              ~~~~~~~
����ʽ������а�������ı�ǡ�0x052Cu����
����λ�� ��:93 �ַ�: 53
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, ...
+                                                     ~
�����б���ȱ�ٲ�����
����λ�� ��:93 �ַ�: 105
+ ... progman, 0x052Cu, [IntPtr]::Zero, [IntPtr]::Zero, 0u, 1000u, [ref]$r)
+                                                                         ~
����ʽ������а�������ı�ǡ�)����
����λ�� ��:95 �ַ�: 45
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [In ...
+                                             ~
��,������ȱ�ٱ���ʽ��
����λ�� ��:95 �ַ�: 46
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [In ...
+                                              ~~~~~~~
����ʽ������а�������ı�ǡ�0x052Cu����
����λ�� ��:95 �ַ�: 53
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [In ...
+                                                     ~
�����б���ȱ�ٲ�����
����λ�� ��:95 �ַ�: 96
+ ... Timeout($progman, 0x052Cu, [IntPtr]13, [IntPtr]1, 0u, 1000u, [ref]$r)
+                                                                         ~
����ʽ������а�������ı�ǡ�)����
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : MissingExpressionAfterToken
 
 stdout= stderr=����λ�� ��:93 �ַ�: 45
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, ...
+                                             ~
��,������ȱ�ٱ���ʽ��
����λ�� ��:93 �ַ�: 46
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, ...
+                                              ~~~~~~~
����ʽ������а�������ı�ǡ�0x052Cu����
����λ�� ��:93 �ַ�: 53
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]::Zero, ...
+                                                     ~
�����б���ȱ�ٲ�����
����λ�� ��:93 �ַ�: 105
+ ... progman, 0x052Cu, [IntPtr]::Zero, [IntPtr]::Zero, 0u, 1000u, [ref]$r)
+                                                                         ~
����ʽ������а�������ı�ǡ�)����
����λ�� ��:95 �ַ�: 45
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [In ...
+                                             ~
��,������ȱ�ٱ���ʽ��
����λ�� ��:95 �ַ�: 46
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [In ...
+                                              ~~~~~~~
����ʽ������а�������ı�ǡ�0x052Cu����
����λ�� ��:95 �ַ�: 53
+ [void][WbDesk]::SendMessageTimeout($progman, 0x052Cu, [IntPtr]13, [In ...
+                                                     ~
�����б���ȱ�ٲ�����
����λ�� ��:95 �ַ�: 96
+ ... Timeout($progman, 0x052Cu, [IntPtr]13, [IntPtr]1, 0u, 1000u, [ref]$r)
+                                                                         ~
����ʽ������а�������ı�ǡ�)����
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : MissingExpressionAfterToken
 

[2026-03-24T08:59:23.711Z] 动态壁纸：WorkerW 附着失败，已退化为普通置底窗口（会挡住桌面图标）。详见同目录 desktop-wallpaper.log

---

## 根据本日志的结论（代码已修）

**根因**：`desktopWallpaperPlayer.ts` 里嵌入的 PowerShell 使用了 **C# 风格** 的字面量 `0x052Cu`、`0u`、`1000u`。在 **Windows PowerShell 5.1** 中这些写法会 **语法解析失败**（报错里会出现无法识别的标记 `0x052Cu`），脚本在 `SendMessageTimeout` 一行就中断，**从未执行 `SetParent`**，因此应用只能走「置底顶层窗口」，必然挡住桌面图标。

**修复**：将上述字面量改为 PowerShell 合法形式，例如 `[uint32]0x052C`、`[uint32]0`、`[uint32]1000`（见 `src/main/desktopWallpaperPlayer.ts`）。

修复后应出现日志行 `WorkerW 附着脚本成功` 且带 `WB_OK target=...`。
