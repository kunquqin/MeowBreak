export type {
  AppSettings,
  CategoryKind,
  PresetPools,
  ReminderCategory,
  SubReminder,
  CountdownItem,
  PopupTheme,
  PopupThemeTarget,
  AppEntitlements,
  ResetIntervalPayload,
  TextTransform,
} from '../../shared/settings'

export {
  getStableDefaultCategories,
  getDefaultReminderCategories,
  getDefaultPresetPools,
  getDefaultPopupThemes,
  getDefaultEntitlements,
  defaultTextTransform,
  genId,
} from '../../shared/settings'
