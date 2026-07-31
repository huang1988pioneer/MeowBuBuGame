using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MeowBuBu.Editor.Models;

namespace MeowBuBu.Editor.ViewModels;

public partial class CampaignEditorViewModel : ViewModelBase
{
    [ObservableProperty] private CampaignData _campaign = CampaignData.CreateDefault();
    [ObservableProperty] private CampaignStage? _selectedStage;
    [ObservableProperty] private string? _filePath;
    [ObservableProperty] private string _statusText = "戰役編輯器就緒";

    [ObservableProperty] private string _newLevelId = "level3";
    [ObservableProperty] private string _newState = "LEVEL3";
    [ObservableProperty] private string _newLabel = "新關卡";

    [RelayCommand]
    private void AddStage()
    {
        var stage = new CampaignStage
        {
            LevelId = string.IsNullOrWhiteSpace(NewLevelId) ? "level" : NewLevelId.Trim(),
            State = string.IsNullOrWhiteSpace(NewState) ? "LEVEL" : NewState.Trim(),
            Label = string.IsNullOrWhiteSpace(NewLabel) ? NewLevelId : NewLabel.Trim()
        };
        Campaign.Stages.Add(stage);
        SelectedStage = stage;
        StatusText = $"已新增關卡節點：{stage.Label}";
    }

    [RelayCommand]
    private void RemoveStage()
    {
        if (SelectedStage is null) return;
        var idx = Campaign.Stages.IndexOf(SelectedStage);
        Campaign.Stages.Remove(SelectedStage);
        SelectedStage = Campaign.Stages.Count == 0
            ? null
            : Campaign.Stages[Math.Clamp(idx, 0, Campaign.Stages.Count - 1)];
        StatusText = "已移除關卡節點";
    }

    [RelayCommand]
    private void MoveUp()
    {
        if (SelectedStage is null) return;
        var i = Campaign.Stages.IndexOf(SelectedStage);
        if (i <= 0) return;
        Campaign.Stages.Move(i, i - 1);
        StatusText = "已上移";
    }

    [RelayCommand]
    private void MoveDown()
    {
        if (SelectedStage is null) return;
        var i = Campaign.Stages.IndexOf(SelectedStage);
        if (i < 0 || i >= Campaign.Stages.Count - 1) return;
        Campaign.Stages.Move(i, i + 1);
        StatusText = "已下移";
    }

    [RelayCommand]
    private void ResetDefault()
    {
        Campaign = CampaignData.CreateDefault();
        SelectedStage = Campaign.Stages.FirstOrDefault();
        FilePath = null;
        StatusText = "已還原預設戰役";
    }
}
