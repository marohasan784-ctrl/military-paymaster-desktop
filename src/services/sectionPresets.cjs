const sectionPresets = [
  {
    id: 'deduction-days',
    title: 'إخطار خصم (أيام)',
    submoduleTitle: 'إخطارات الخصم بالأيام',
    fields: [
      { key: 'field_1', label: 'الفرد', type: 'person', personCategory: 'all', required: true },
      { key: 'field_2', label: 'النص الجاهز', type: 'template', templateScope: 'global' },
      { key: 'field_3', label: 'المدة بالأيام', type: 'duration' },
      { key: 'field_4', label: 'رقم البند / الأمر', type: 'text' },
      { key: 'field_5', label: 'التاريخ', type: 'date' },
      { key: 'field_6', label: 'ملاحظات', type: 'text' }
    ],
    templates: [
      {
        title: 'إخطار خصم بأيام',
        body: 'إخطار بخصم {المدة بالأيام} من استحقاق المذكور {الاسم}، رقم عسكري {الرقم_العسكري}، استناداً إلى {رقم البند / الأمر} بتاريخ {التاريخ}.',
        requiresDays: true
      }
    ]
  },
  {
    id: 'deduction-percentage',
    title: 'إخطار خصم (نسبة %)',
    submoduleTitle: 'إخطارات الخصم بالنسبة',
    fields: [
      { key: 'field_1', label: 'الفرد', type: 'person', personCategory: 'all', required: true },
      { key: 'field_2', label: 'النص الجاهز', type: 'template', templateScope: 'global' },
      { key: 'field_3', label: 'النسبة', type: 'percentage' },
      { key: 'field_4', label: 'رقم البند / الأمر', type: 'text' },
      { key: 'field_5', label: 'التاريخ', type: 'date' },
      { key: 'field_6', label: 'ملاحظات', type: 'text' }
    ],
    templates: [
      {
        title: 'إخطار خصم بنسبة',
        body: 'إخطار بشأن خصم بنسبة {النسبة} من استحقاق المذكور {الاسم}، رقم عسكري {الرقم_العسكري}، استناداً إلى {رقم البند / الأمر} بتاريخ {التاريخ}.',
        requiresDays: false
      }
    ]
  },
  {
    id: 'supply-release',
    title: 'أمر توريد - رفد/إنهاء خدمة',
    submoduleTitle: 'أوامر توريد - رفد/إنهاء خدمة',
    fields: [
      { key: 'field_1', label: 'الفرد', type: 'person', personCategory: 'all', required: true },
      { key: 'field_2', label: 'النص الجاهز', type: 'template', templateScope: 'global' },
      { key: 'field_3', label: 'سبب الإنهاء', type: 'saved_value' },
      { key: 'field_4', label: 'تاريخ انتهاء الاستحقاق', type: 'date' },
      { key: 'field_5', label: 'تاريخ القبض', type: 'date' },
      { key: 'field_6', label: 'المدة بالأيام', type: 'duration' },
      { key: 'field_7', label: 'ربط بسجل', type: 'linked_record' },
      { key: 'field_8', label: 'رقم الأمر', type: 'text' },
      { key: 'field_9', label: 'التاريخ', type: 'date' },
      { key: 'field_10', label: 'ملاحظات', type: 'text' }
    ],
    templates: [
      {
        title: 'أمر توريد بسبب رفد أو إنهاء خدمة',
        body: 'أمر توريد متعلق بالفرد {الاسم}، رقم عسكري {الرقم_العسكري}، بسبب {سبب_الإنهاء}. تاريخ انتهاء الاستحقاق {تاريخ_انتهاء_الاستحقاق}، وتاريخ القبض {تاريخ_القبض}، والمدة المسجلة {المدة_بالأيام} يوم. رقم الأمر {رقم_الأمر} بتاريخ {التاريخ}.',
        requiresDays: false
      }
    ]
  },
  {
    id: 'supply-penalty',
    title: 'أمر توريد - جزاء',
    submoduleTitle: 'أوامر توريد - جزاء',
    fields: [
      { key: 'field_1', label: 'الفرد', type: 'person', personCategory: 'all', required: true },
      { key: 'field_2', label: 'النص الجاهز', type: 'template', templateScope: 'global' },
      { key: 'field_3', label: 'ربط بسجل', type: 'linked_record' },
      { key: 'field_4', label: 'سبب الأمر', type: 'saved_value' },
      { key: 'field_5', label: 'رقم الأمر', type: 'text' },
      { key: 'field_6', label: 'التاريخ', type: 'date' },
      { key: 'field_7', label: 'ملاحظات', type: 'text' }
    ],
    templates: [
      {
        title: 'أمر توريد مرتبط بجزاء',
        body: 'أمر توريد للفرد {الاسم}، رقم عسكري {الرقم_العسكري}، مرتبط بالسجل {ربط_بسجل}. سبب الأمر: {سبب_الأمر}. رقم الأمر {رقم_الأمر} بتاريخ {التاريخ}.',
        requiresDays: false
      }
    ]
  }
];

module.exports = { sectionPresets };
