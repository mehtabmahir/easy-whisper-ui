#include "LiveTranscriber.h"
#include <QCoreApplication>
#include <QThread>
#include <QRegularExpression>

LiveTranscriber::LiveTranscriber(QObject *parent) : QObject(parent)
{
    proc.setProcessChannelMode(QProcess::MergedChannels);


    connect(&proc, &QProcess::readyRead, this, [this]{
        static const QRegularExpression escSeq(R"(\x1B\[[0-9;]*[A-Za-z])"); // ANSI
        QString txt = QString::fromLocal8Bit(proc.readAll());
        txt.remove(escSeq);                     // ⚑ deletes “\x1B[2K”, colors, etc.
        emit newText(txt.trimmed());
    });

    connect(&proc,
            QOverload<int,QProcess::ExitStatus>::of(&QProcess::finished),
            this, &LiveTranscriber::finished);
}

void LiveTranscriber::start(const QString &model, const QString &lang,
                            bool cpuOnly, int stepMs, int lengthMs)
{
    if (proc.state() != QProcess::NotRunning) return;

    QString exe = QCoreApplication::applicationDirPath() + "/whisper-stream.exe";

    QStringList args{
        "-m", model,
        "-l", lang,
        "--step", QString::number(stepMs),
        "--length", QString::number(lengthMs),
        "-t", QString::number(QThread::idealThreadCount())
    };
    if (cpuOnly) args << "--no-gpu";

    proc.setProgram(exe);
    proc.setArguments(args);
    proc.start();
}

void LiveTranscriber::stop()
{
    if (proc.state() == QProcess::NotRunning) return;
    proc.terminate();
    if (!proc.waitForFinished(1500))
        proc.kill();
}
