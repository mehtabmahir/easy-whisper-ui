#include "settings.h"
#include <QCoreApplication>

Settings::Settings()
    : settings(QCoreApplication::applicationDirPath() + "/settings.ini", QSettings::IniFormat)
{
}

void Settings::load(QComboBox* model, QComboBox* language,
                    QCheckBox* txt, QCheckBox* srt, QCheckBox* cpu,
                    QPlainTextEdit* args)
{
    model->setCurrentIndex(settings.value("model", 3).toInt());
    language->setCurrentIndex(settings.value("language", 0).toInt());
    txt->setChecked(settings.value("txtFile", true).toBool());
    srt->setChecked(settings.value("srtFile", false).toBool());
    cpu->setChecked(settings.value("cpuOnly", false).toBool());
    args->setPlainText(settings.value("args", "--temperature 0.0 --max-context 64 --entropy-thold 3.0").toString());
}

void Settings::save(QComboBox* model, QComboBox* language,
                    QCheckBox* txt, QCheckBox* srt, QCheckBox* cpu,
                    QPlainTextEdit* args)
{
    settings.setValue("model", model->currentIndex());
    settings.setValue("language", language->currentIndex());
    settings.setValue("txtFile", txt->isChecked());
    settings.setValue("srtFile", srt->isChecked());
    settings.setValue("cpuOnly", cpu->isChecked());
    settings.setValue("args", args->toPlainText());
}
