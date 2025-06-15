#ifndef SETTINGS_H
#define SETTINGS_H

#pragma once
#include <QSettings>
#include <QComboBox>
#include <QCheckBox>
#include <QPlainTextEdit>

class Settings
{
public:
    Settings();

    void load(QComboBox* model, QComboBox* language,
              QCheckBox* txt, QCheckBox* srt, QCheckBox* cpu,
              QPlainTextEdit* args);

    void save(QComboBox* model, QComboBox* language,
              QCheckBox* txt, QCheckBox* srt, QCheckBox* cpu,
              QPlainTextEdit* args);

private:
    QSettings settings;
};



#endif // SETTINGS_H
