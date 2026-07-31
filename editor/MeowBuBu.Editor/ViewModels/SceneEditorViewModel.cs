using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MeowBuBu.Editor.Models;

namespace MeowBuBu.Editor.ViewModels;

public partial class SceneEditorViewModel : ViewModelBase
{
    [ObservableProperty] private SceneData _scene = SceneData.CreateDefaultPrologue();
    [ObservableProperty] private string? _selectedText;
    [ObservableProperty] private int _selectedIndex = -1;
    [ObservableProperty] private string _editText = "";
    [ObservableProperty] private string? _filePath;
    [ObservableProperty] private string _statusText = "場景編輯器就緒";

    public string[] BgOptions { get; } = ["prologue", "forest", "castle", "boss"];

    partial void OnSelectedTextChanged(string? value)
    {
        EditText = value ?? "";
        SelectedIndex = value is null ? -1 : Scene.Texts.IndexOf(value);
    }

    [RelayCommand]
    private void AddText()
    {
        var t = string.IsNullOrWhiteSpace(EditText) ? "（新對白）" : EditText.Trim();
        Scene.Texts.Add(t);
        SelectedText = t;
        StatusText = "已新增對白";
    }

    [RelayCommand]
    private void UpdateText()
    {
        if (SelectedIndex < 0 || SelectedIndex >= Scene.Texts.Count) return;
        var t = EditText.Trim();
        if (string.IsNullOrEmpty(t)) return;
        Scene.Texts[SelectedIndex] = t;
        SelectedText = t;
        StatusText = "已更新對白";
    }

    [RelayCommand]
    private void RemoveText()
    {
        if (SelectedIndex < 0 || SelectedIndex >= Scene.Texts.Count) return;
        var i = SelectedIndex;
        Scene.Texts.RemoveAt(i);
        SelectedText = Scene.Texts.Count == 0
            ? null
            : Scene.Texts[Math.Clamp(i, 0, Scene.Texts.Count - 1)];
        StatusText = "已刪除對白";
    }

    [RelayCommand]
    private void MoveUp()
    {
        if (SelectedIndex <= 0) return;
        var i = SelectedIndex;
        var item = Scene.Texts[i];
        Scene.Texts.RemoveAt(i);
        Scene.Texts.Insert(i - 1, item);
        SelectedText = item;
        StatusText = "已上移";
    }

    [RelayCommand]
    private void MoveDown()
    {
        if (SelectedIndex < 0 || SelectedIndex >= Scene.Texts.Count - 1) return;
        var i = SelectedIndex;
        var item = Scene.Texts[i];
        Scene.Texts.RemoveAt(i);
        Scene.Texts.Insert(i + 1, item);
        SelectedText = item;
        StatusText = "已下移";
    }

    [RelayCommand]
    private void ResetDefault()
    {
        Scene = SceneData.CreateDefaultPrologue();
        SelectedText = Scene.Texts.FirstOrDefault();
        FilePath = null;
        StatusText = "已還原預設序章";
    }
}
